import { randomUUID } from 'node:crypto';
import { Router, raw, type Request, type Response, type NextFunction } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { dateSchema, definitionSchema, dueDates, flagsFor, validateAnswers, type Answers, type Definition } from './checkin-model.js';
import { normalizeCheckinPhoto, PostgresCheckinPhotoStorage } from './checkin-photo-storage.js';
import { rateLimit } from 'express-rate-limit';

const photoStorage = new PostgresCheckinPhotoStorage();

class CheckinError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
type Form = { id: string; version: number; definition: Definition; isDefault: boolean };
type Assignment = { id: string; coach_id: string; client_id: string; form_snapshot: Definition };
type Submission = { id: string; status: 'DRAFT'|'SUBMITTED'|'REVIEWED'; data: Answers; submitted_snapshot: Answers | null; revision: number };
async function tx<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function audit(client: PoolClient, actor: string, action: string, id: string, data: object) {
  await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'CHECKIN',$3,$4)", [actor, action, id, JSON.stringify(data)]);
}
async function log(client: PoolClient, actor: string, action: string, id: string, revision: number, snapshot: object) {
  await client.query('INSERT INTO checkin_logs(assignment_id,actor_id,action,revision,snapshot) VALUES($1,$2,$3,$4,$5)', [id, actor, action, revision, JSON.stringify(snapshot)]);
  await audit(client, actor, action, id, { revision });
}
async function pair(client: PoolClient, coachId: string, clientId: string) {
  const result = await client.query(`SELECT cc.id FROM coach_clients cc JOIN users c ON c.id=cc.client_id JOIN users coach ON coach.id=cc.coach_id WHERE cc.coach_id=$1 AND cc.client_id=$2 AND cc.status='APPROVED' AND c.account_status='APPROVED' AND coach.account_status='APPROVED' FOR SHARE OF cc,c,coach`, [coachId,clientId]);
  if (!result.rowCount) throw new CheckinError('Approved client relationship not found',404);
}
async function assignment(client: PoolClient, id: string, actor: string, coach: boolean) {
  const result = await client.query<Assignment>(`SELECT * FROM checkin_assignments WHERE id=$1 AND ${coach ? 'coach_id' : 'client_id'}=$2 FOR UPDATE`, [id, actor]);
  if (!result.rows[0]) throw new CheckinError('Check-in not found',404);
  await pair(client, result.rows[0].coach_id, result.rows[0].client_id);
  return result.rows[0];
}
const listSql = `SELECT ca.id,ca.client_id "clientId",COALESCE(cp.display_name,'Client') "clientName",ca.due_date::text "dueDate",ca.notes,ca.form_snapshot "form",ca.form_id "formId",ca.form_version "formVersion",ca.frequency,ca.schedule_id "scheduleId",COALESCE(cs.status::text,'PENDING') status,COALESCE(cs.submitted_snapshot,cs.data,'{}') data,COALESCE(cs.revision,0) revision,cs.submitted_at "submittedAt",cs.reviewed_at "reviewedAt",cs.review_status "reviewStatus",cs.review_notes "reviewNotes",cs.flags FROM checkin_assignments ca LEFT JOIN checkin_submissions cs ON cs.assignment_id=ca.id LEFT JOIN client_profiles cp ON cp.user_id=ca.client_id JOIN coach_clients cc ON cc.coach_id=ca.coach_id AND cc.client_id=ca.client_id JOIN users coach ON coach.id=ca.coach_id JOIN users person ON person.id=ca.client_id WHERE cc.status='APPROVED' AND coach.account_status='APPROVED' AND person.account_status='APPROVED'`;
function errors(error: unknown, _request: Request, response: Response, next: NextFunction) {
  if (error && typeof error==='object' && 'type' in error && error.type==='entity.too.large') {response.status(413).json({message:'Choose a photo smaller than 8 MB.'});return;}
  if (error instanceof z.ZodError) { response.status(400).json({ message: 'Check the submitted fields', details: error.flatten() }); return; }
  if (error instanceof CheckinError) { response.status(error.status).json({ message: error.message }); return; }
  next(error);
}
function photoRoutes(router:Router,pool:Pool,coach:boolean) {
  router.get('/:id/photos',async(request,response)=>{
    const id=z.string().uuid().parse(request.params.id);
    const photos=await tx(pool,async client=>{await assignment(client,id,request.auth!.userId,coach);return photoStorage.list(client,id);});
    response.set('Cache-Control','private, no-store').json({photos});
  });
  router.get('/:id/photos/:photoId',async(request,response)=>{
    const id=z.string().uuid().parse(request.params.id),photoId=z.string().uuid().parse(request.params.photoId);
    const bytes=await tx(pool,async client=>{await assignment(client,id,request.auth!.userId,coach);return photoStorage.read(client,id,photoId);});
    if(!bytes)throw new CheckinError('Photo not found',404);
    response.set({'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="checkin-photo.jpg"'}).send(bytes);
  });
  if(coach)return;
  router.post('/:id/photos',rateLimit({windowMs:60000,limit:20,keyGenerator:request=>request.auth!.userId,standardHeaders:true,legacyHeaders:false,message:{message:'Too many photo uploads. Please wait a minute.'}}),raw({type:'application/octet-stream',limit:'8mb',inflate:false}),async(request,response)=>{
    const id=z.string().uuid().parse(request.params.id);
    const body:unknown=request.body;
    if(!Buffer.isBuffer(body))throw new CheckinError('Upload the photo as binary image data',400);
    const photo=await tx(pool,async client=>{
      await assignment(client,id,request.auth!.userId,false);
      const submitted=await client.query("SELECT id FROM checkin_submissions WHERE assignment_id=$1 AND status<>'DRAFT'",[id]);
      if(submitted.rowCount)throw new CheckinError('Photos are locked after submission');
      if((await photoStorage.list(client,id)).length>=5)throw new CheckinError('A check-in can contain up to 5 photos',400);
      let normalized:Buffer;
      try{normalized=await normalizeCheckinPhoto(body);}catch(error){throw new CheckinError(error instanceof Error?error.message:'Invalid photo',400);}
      const saved=await photoStorage.put(client,id,request.auth!.userId,normalized);
      await log(client,request.auth!.userId,'CHECKIN_PHOTO_ADDED',id,0,{photoId:saved.id});
      return saved;
    });
    response.status(201).json({photo});
  });
  router.delete('/:id/photos/:photoId',async(request,response)=>{
    const id=z.string().uuid().parse(request.params.id),photoId=z.string().uuid().parse(request.params.photoId);
    await tx(pool,async client=>{
      await assignment(client,id,request.auth!.userId,false);
      const submitted=await client.query("SELECT id FROM checkin_submissions WHERE assignment_id=$1 AND status<>'DRAFT'",[id]);
      if(submitted.rowCount)throw new CheckinError('Photos are locked after submission');
      if(!await photoStorage.remove(client,id,photoId))throw new CheckinError('Photo not found',404);
      await log(client,request.auth!.userId,'CHECKIN_PHOTO_REMOVED',id,0,{photoId});
    });
    response.status(204).send();
  });
}
export function createCoachCheckins(pool: Pool): Router {
  const router = Router();
  photoRoutes(router,pool,true);
  router.get('/forms', async (request,response) => {
    const result = await pool.query<Form>('SELECT id,version,definition,is_default "isDefault" FROM checkin_forms WHERE coach_id=$1 ORDER BY updated_at DESC',[request.auth!.userId]);
    response.json({ forms: result.rows });
  });
  const formInput = z.object({ definition: definitionSchema, isDefault: z.boolean().default(false), version: z.number().int().positive().optional() }).strict();
  async function saveForm(request: Request, response: Response, id?: string) {
    const input = formInput.parse(request.body);
    const form = await tx(pool, async client => {
      // Serialize default changes for the same coach.
      await client.query('SELECT user_id FROM coach_profiles WHERE user_id=$1 FOR UPDATE',[request.auth!.userId]);
      let version = 1;
      if (id) {
        z.string().uuid().parse(id);
        const existing = await client.query<Form>('SELECT id,version FROM checkin_forms WHERE id=$1 AND coach_id=$2 FOR UPDATE',[id,request.auth!.userId]);
        if (!existing.rows[0]) throw new CheckinError('Form not found',404);
        if (existing.rows[0].version !== input.version) throw new CheckinError('This form changed. Reload before saving.');
        version = existing.rows[0].version + 1;
      }
      if (input.isDefault) await client.query('UPDATE checkin_forms SET is_default=false WHERE coach_id=$1 AND is_default',[request.auth!.userId]);
      const saved = id ? await client.query<Form>('UPDATE checkin_forms SET definition=$1,version=$2,is_default=$3,updated_at=now() WHERE id=$4 RETURNING id,version,definition,is_default "isDefault"',[JSON.stringify(input.definition),version,input.isDefault,id]) : await client.query<Form>('INSERT INTO checkin_forms(coach_id,definition,is_default) VALUES($1,$2,$3) RETURNING id,version,definition,is_default "isDefault"',[request.auth!.userId,JSON.stringify(input.definition),input.isDefault]);
      const row = saved.rows[0]!;
      await client.query('INSERT INTO checkin_form_versions(form_id,version,definition) VALUES($1,$2,$3)',[row.id,row.version,JSON.stringify(row.definition)]);
      await audit(client,request.auth!.userId,'CHECKIN_FORM_SAVED',row.id,{version:row.version,isDefault:row.isDefault});
      return row;
    });
    response.status(id ? 200 : 201).json({form});
  }
  router.post('/forms', (request,response) => saveForm(request,response));
  router.put('/forms/:id', (request,response) => saveForm(request,response,String(request.params.id)));
  router.post('/', async (request,response) => {
    const input = z.object({ formId: z.string().uuid().optional(), clientIds: z.array(z.string().uuid()).min(1).max(50), dueDate: dateSchema, frequency: z.literal('DAILY').default('DAILY'), occurrences: z.number().int().min(1).max(366).default(30), notes: z.string().max(2000).default('') }).strict().parse(request.body);
    const result = await tx(pool, async client => {
      const form = await client.query<Form>(`SELECT id,version,definition FROM checkin_forms WHERE coach_id=$1 AND ${input.formId ? 'id=$2' : 'is_default=true'} FOR SHARE`,input.formId ? [request.auth!.userId,input.formId] : [request.auth!.userId]);
      if (!form.rows[0]) throw new CheckinError('Choose a published form',404);
      const dates = dueDates(input.dueDate,input.frequency,input.occurrences);
      const ids: string[] = [];
      const schedule = randomUUID();
      for (const clientId of [...new Set(input.clientIds)].sort()) {
        await pair(client,request.auth!.userId,clientId);
        for (const date of dates) {
          const created = await client.query<{id:string}>('INSERT INTO checkin_assignments(coach_id,client_id,due_date,notes,form_id,form_version,form_snapshot,schedule_id,frequency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[request.auth!.userId,clientId,date,input.notes,form.rows[0].id,form.rows[0].version,JSON.stringify(form.rows[0].definition),schedule,input.frequency]);
          ids.push(created.rows[0]!.id);
          await log(client,request.auth!.userId,'CHECKIN_ASSIGNED',created.rows[0]!.id,0,{dueDate:date,formId:form.rows[0].id,formVersion:form.rows[0].version});
        }
      }
      return ids;
    });
    response.status(201).json({assignmentIds:result});
  });
  router.get('/', async (request,response) => response.json({checkins:(await pool.query(`${listSql} AND ca.coach_id=$1 ORDER BY ca.due_date DESC,ca.id`,[request.auth!.userId])).rows}));
  router.post('/:id/reschedule',async(request,response)=>{
    const id=z.string().uuid().parse(request.params.id);
    const input=z.object({dueDate:dateSchema,previousDate:dateSchema}).strict().parse(request.body);
    await tx(pool,async client=>{
      await assignment(client,id,request.auth!.userId,true);
      const submitted=await client.query("SELECT id FROM checkin_submissions WHERE assignment_id=$1 AND status<>'DRAFT'",[id]);
      if(submitted.rowCount)throw new CheckinError('Submitted check-ins cannot be rescheduled');
      const updated=await client.query('UPDATE checkin_assignments SET due_date=$1 WHERE id=$2 AND due_date=$3 RETURNING id',[input.dueDate,id,input.previousDate]);
      if(!updated.rowCount)throw new CheckinError('The due date changed. Reload before rescheduling.');
      await log(client,request.auth!.userId,'CHECKIN_RESCHEDULED',id,0,{previousDate:input.previousDate,dueDate:input.dueDate});
    });
    response.json({saved:true});
  });
  router.post('/:id/review', async (request,response) => {
    const id = z.string().uuid().parse(request.params.id);
    const input = z.object({ revision:z.number().int().nonnegative(), status:z.enum(['ON_TRACK','NEUTRAL','NEEDS_ATTENTION']), notes:z.string().trim().max(4000).default('') }).strict().parse(request.body);
    await tx(pool,async client => {
      await assignment(client,id,request.auth!.userId,true);
      const saved = await client.query<Submission>("UPDATE checkin_submissions SET status='REVIEWED',review_status=$1,review_notes=$2,reviewed_at=now(),reviewed_by=$3,revision=revision+1,updated_at=now() WHERE assignment_id=$4 AND status IN ('SUBMITTED','REVIEWED') AND revision=$5 RETURNING *",[input.status,input.notes,request.auth!.userId,id,input.revision]);
      if (!saved.rows[0]) throw new CheckinError('Check-in changed or has not been submitted. Reload before reviewing.');
      await log(client,request.auth!.userId,'CHECKIN_REVIEWED',id,saved.rows[0].revision,{status:input.status,notes:input.notes});
    });
    response.json({saved:true});
  });
  router.get('/:id/history',async (request,response) => {
    const id = z.string().uuid().parse(request.params.id);
    const history = await tx(pool,async client => {
      await assignment(client,id,request.auth!.userId,true);
      return (await client.query<{id:string;actorId:string;action:string;revision:number;snapshot:Record<string,unknown>;createdAt:string}>('SELECT id,actor_id "actorId",action,revision,snapshot,created_at "createdAt" FROM checkin_logs WHERE assignment_id=$1 ORDER BY created_at,id',[id])).rows;
    });
    response.json({history});
  });
  router.use(errors);
  return router;
}
export function createClientCheckins(pool: Pool): Router {
  const router = Router();
  photoRoutes(router,pool,false);
  router.get('/',async (request,response) => response.json({checkins:(await pool.query(`${listSql} AND ca.client_id=$1 ORDER BY ca.due_date DESC,ca.id`,[request.auth!.userId])).rows}));
  async function save(request: Request,response: Response,submit:boolean) {
    const id = z.string().uuid().parse(request.params.id);
    const input = z.object({revision:z.number().int().nonnegative(),answers:z.unknown()}).strict().parse(request.body);
    const result = await tx(pool,async client => {
      const row = await assignment(client,id,request.auth!.userId,false);
      const existing = (await client.query<Submission>('SELECT * FROM checkin_submissions WHERE assignment_id=$1 FOR UPDATE',[id])).rows[0];
      if (existing && existing.status !== 'DRAFT') throw new CheckinError('Submitted check-ins are locked');
      if ((existing?.revision ?? 0) !== input.revision) throw new CheckinError('This draft changed. Reload before saving.');
      let answers: Answers;
      try { answers = validateAnswers(row.form_snapshot,input.answers,submit); }
      catch (error) { throw new CheckinError(error instanceof Error ? error.message : 'Invalid answers',400); }
      const flags = submit ? flagsFor(row.form_snapshot,answers) : [];
      const photos=await photoStorage.list(client,id);
      if(submit&&photos.length===0)throw new CheckinError('Upload at least one photo before submitting your check-in',400);
      const saved = await client.query<Submission>(`INSERT INTO checkin_submissions(assignment_id,coach_id,client_id,data,status,submitted_snapshot,submitted_at,flags) VALUES($1,$2,$3,$4,$5::record_status,$6,CASE WHEN $5='SUBMITTED' THEN now() ELSE NULL END,$7) ON CONFLICT(assignment_id) DO UPDATE SET data=excluded.data,status=excluded.status,submitted_snapshot=excluded.submitted_snapshot,submitted_at=excluded.submitted_at,flags=excluded.flags,revision=checkin_submissions.revision+1,updated_at=now() RETURNING *`,[id,row.coach_id,row.client_id,JSON.stringify(answers),submit?'SUBMITTED':'DRAFT',submit?JSON.stringify(answers):null,JSON.stringify(flags)]);
      if(submit)await client.query('UPDATE checkin_submissions SET submitted_photo_ids=$1 WHERE assignment_id=$2',[photos.map(photo=>photo.id),id]);
      await log(client,request.auth!.userId,submit?'CHECKIN_SUBMITTED':'CHECKIN_DRAFT_SAVED',id,saved.rows[0]!.revision,{answers,status:submit?'SUBMITTED':'DRAFT',flags,...(submit?{photoIds:photos.map(photo=>photo.id)}:{})});
      return {revision:saved.rows[0]!.revision,status:saved.rows[0]!.status};
    });
    response.json({submission:result});
  }
  router.put('/:id',(request,response)=>save(request,response,false));
  router.post('/:id/submit',(request,response)=>save(request,response,true));
  router.use(errors);
  return router;
}
