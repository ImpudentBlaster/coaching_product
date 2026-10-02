import { foodCatalog, foodCopyId } from './food-catalog.js';
import { Router, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

const number = z.number().finite().nonnegative().max(100000);
export const nutrientsSchema = z.object({ calories: number, protein: number, carbs: number, fat: number });
type Nutrients = z.infer<typeof nutrientsSchema>;
const base = { name: z.string().trim().min(2).max(150), notes: z.string().trim().max(2000).default('') };
const ref = z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(100) });
const foodRef = z.object({ id: z.string().uuid(), quantity: z.number().finite().min(0.01).max(10000) });
const dayItem = z.union([ref.extend({type:z.literal('meals').optional()}),ref.extend({type:z.literal('foods'),quantity:z.number().finite().min(0.01).max(10000)}),ref.extend({type:z.literal('custom'),foods:z.array(foodRef).min(1).max(30)})]);
const planItem = z.union([ref.extend({type:z.literal('days').optional()}),ref.extend({type:z.literal('custom'),notes:base.notes,items:z.array(dayItem).min(1).max(12)})]);
export const nutritionInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('foods'), ...base, servingSize: z.number().finite().min(0.01).max(10000), unit: z.enum(['g', 'ml', 'piece']), nutrients: nutrientsSchema }),
  z.object({ kind: z.literal('meals'), ...base, items: z.array(z.object({ id: z.string().uuid(), quantity: z.number().finite().min(0.01).max(10000) })).min(1).max(30) }),
  z.object({ kind: z.literal('days'), ...base, items: z.array(dayItem).min(1).max(12) }),
  z.object({ kind: z.literal('plans'), ...base, items: z.array(planItem).min(1).max(31) }),
]);
type Kind = z.infer<typeof nutritionInput>['kind'];
export type NutritionNode = { name: string; notes: string; kind: Kind; custom?: boolean; nutrients?: Nutrients; servingSize?: number; unit?: string; items?: Array<{ id: string; label?: string; quantity?: number; node: NutritionNode; nutrients?: Nutrients }> };
type Entry = { id: string; data: NutritionNode; createdAt: string; updatedAt:string; version:number };
class NutritionError extends Error {}
const kinds = z.enum(['foods', 'meals', 'days', 'plans']);

export function sumNutrients(values: Nutrients[]): Nutrients {
  return values.reduce((total, value) => ({ calories: total.calories + value.calories, protein: total.protein + value.protein, carbs: total.carbs + value.carbs, fat: total.fat + value.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}
export function portion(nutrients: Nutrients, quantity: number, servingSize: number): Nutrients {
  const factor = quantity / servingSize;
  return { calories: nutrients.calories * factor, protein: nutrients.protein * factor, carbs: nutrients.carbs * factor, fat: nutrients.fat * factor };
}
async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function audit(client: PoolClient, coach: string, action: string, id: string, metadata: object) {
  await client.query('INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [coach, action, 'NUTRITION', id, JSON.stringify(metadata)]);
}

export function createNutritionCoachRouter(pool: Pool): Router {
  const router = Router();
  router.get('/', async (request, response) => {
    const result = await pool.query<Entry>('SELECT id,data,version,created_at "createdAt",updated_at "updatedAt" FROM nutrition_library WHERE coach_id=$1 AND archived_at IS NULL ORDER BY updated_at DESC,id', [request.auth!.userId]);
    const assignments = await pool.query<{ id: string; clientId: string; planId: string; assignedAt: string }>('SELECT id,client_id "clientId",plan_id "planId",assigned_at "assignedAt" FROM nutrition_plan_assignments WHERE coach_id=$1 AND active=true', [request.auth!.userId]);
    response.json({ entries: result.rows, assignments: assignments.rows });
  });
  router.get('/catalog', (request,response) => response.json({foods:foodCatalog.map(food=>({...food,libraryEntryId:foodCopyId(request.auth!.userId,food.id)}))}));
  router.post('/catalog/:id/add', async (request,response) => {
    const food=foodCatalog.find(item=>item.id===request.params.id);
    if(!food)return response.status(404).json({message:'Starter food not found'});
    const coachId=request.auth!.userId;const id=foodCopyId(coachId,food.id);
    const result=await transaction(pool,async client=>{
      const added=await client.query<Entry>(`INSERT INTO nutrition_library(id,coach_id,kind,data) VALUES($1,$2,'foods',$3)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data,archived_at=NULL,version=nutrition_library.version+1,updated_at=now()
        WHERE nutrition_library.coach_id=$2 AND nutrition_library.archived_at IS NOT NULL
        RETURNING id,data,version,created_at "createdAt",updated_at "updatedAt"`,[id,coachId,JSON.stringify(food.data)]);
      if(added.rows[0]){
        await audit(client,coachId,'NUTRITION_CATALOG_ADDED',id,{catalogId:food.id,fdcId:food.source.fdcId});
        return {entry:added.rows[0],added:true};
      }
      const existing=await client.query<Entry>('SELECT id,data,version,created_at "createdAt",updated_at "updatedAt" FROM nutrition_library WHERE id=$1 AND coach_id=$2 AND archived_at IS NULL',[id,coachId]);
      if(!existing.rows[0])throw new Error('Food copy unavailable');
      return {entry:existing.rows[0],added:false};
    });
    return response.status(result.added?201:200).json(result);
  });
  async function saveEntry(request:Request,response:Response) {
    const kind = kinds.safeParse(request.params.kind);
    const body: unknown = request.body;
    const parsed = nutritionInput.safeParse(body && typeof body === 'object' ? { ...body, kind: kind.data } : null);
    if (!kind.success || !parsed.success) return response.status(400).json({ message: 'Check the nutrition fields, quantities and selections.' });
    const input = parsed.data;
    const id=request.params.id;
    const version=z.object({version:z.number().int().positive()}).safeParse(body);
    if(id&&(!z.string().uuid().safeParse(id).success||!version.success))return response.status(400).json({message:'Reload the entry before editing.'});
    try {
      const entry = await transaction(pool, async client => {
        const node: NutritionNode = { kind: input.kind, name: input.name, notes: input.notes };
        if (input.kind === 'foods') Object.assign(node, { servingSize: input.servingSize, unit: input.unit, nutrients: input.nutrients });
        else {
          const dayIds=(item:z.infer<typeof dayItem>)=>'foods' in item?item.foods.map(food=>food.id):[item.id];
          const ids=input.items.flatMap(item=>'items' in item?item.items.flatMap(dayIds):'foods' in item?item.foods.map(food=>food.id):[item.id]);
          const children=await client.query<Entry>('SELECT id,data FROM nutrition_library WHERE coach_id=$1 AND kind=ANY($2::text[]) AND archived_at IS NULL AND id=ANY($3::uuid[])',[request.auth!.userId,input.kind==='plans'?['days','meals','foods']:input.kind==='days'?['meals','foods']:['foods'],ids]);
          function childNode(id:string,kind:Kind):NutritionNode {
            const child=children.rows.find(row=>row.id===id)?.data;
            if(!child||child.kind!==kind)throw new NutritionError('A selected entry is unavailable. Choose matching entries from your own library.');
            return child;
          }
          function foodPortion(food:z.infer<typeof foodRef>) {
            const child=childNode(food.id,'foods');
            return {id:food.id,quantity:food.quantity,node:child,nutrients:portion(child.nutrients!,food.quantity,child.servingSize!)};
          }
          function dayEntry(item:z.infer<typeof dayItem>):NonNullable<NutritionNode['items']>[number] {
            if('foods' in item) {
              const foods=item.foods.map(foodPortion);const nutrients=sumNutrients(foods.map(food=>food.nutrients));
              return {id:item.id,label:item.label,node:{kind:'meals',custom:true,name:item.label,notes:'',items:foods,nutrients},nutrients};
            }
            if('quantity' in item)return {...foodPortion(item),label:item.label};
            const child=childNode(item.id,'meals');
            return {id:item.id,label:item.label,node:child,nutrients:child.nutrients!};
          }
          if(input.kind==='meals')node.items=input.items.map(foodPortion);
          else if(input.kind==='days')node.items=input.items.map(dayEntry);
          else node.items=input.items.map(item=>{
            if('items' in item) {
              const meals=item.items.map(dayEntry);const nutrients=sumNutrients(meals.map(meal=>meal.nutrients!));
              return {id:item.id,label:item.label,node:{kind:'days' as const,custom:true,name:item.label,notes:item.notes,items:meals,nutrients},nutrients};
            }
            const child=childNode(item.id,'days');
            return {id:item.id,label:item.label,node:child,...(child.nutrients?{nutrients:child.nutrients}:{})};
          });
          if (input.kind !== 'plans') node.nutrients = sumNutrients(node.items.map(item => item.nutrients!));
        }
        const serialized = JSON.stringify(node);
        if (Buffer.byteLength(serialized) > 512000) throw new NutritionError('This plan is too large. Use fewer days or meals.');
        const result = id ? await client.query<Entry>('UPDATE nutrition_library SET data=$1,version=version+1,updated_at=now() WHERE id=$2 AND coach_id=$3 AND kind=$4 AND version=$5 AND archived_at IS NULL RETURNING id,data,version,created_at "createdAt",updated_at "updatedAt"',[serialized,id,request.auth!.userId,input.kind,version.success?version.data.version:0]) : await client.query<Entry>('INSERT INTO nutrition_library(coach_id,kind,data) VALUES($1,$2,$3) RETURNING id,data,version,created_at "createdAt",updated_at "updatedAt"', [request.auth!.userId, input.kind, serialized]);
        if(!result.rows[0])throw new NutritionError('Entry changed or is unavailable. Reload the list and try again.');
        const saved = result.rows[0];
        await audit(client, request.auth!.userId, id?'NUTRITION_UPDATED':'NUTRITION_CREATED', saved.id, { kind: input.kind });
        return saved;
      });
      return response.status(id?200:201).json({ entry });
    } catch (error) {
      if (error instanceof NutritionError) return response.status(400).json({ message: error.message });
      throw error;
    }
  }
  router.post('/:kind', saveEntry);
  router.put('/:kind/:id', saveEntry);
  router.delete('/:kind/:id',async(request,response)=>{
    if(!z.string().uuid().safeParse(request.params.id).success||!kinds.safeParse(request.params.kind).success)return response.status(400).json({message:'Invalid entry'});
    const removed=await transaction(pool,async client=>{
      const row=await client.query<{id:string}>('UPDATE nutrition_library SET archived_at=now(),updated_at=now() WHERE id=$1 AND coach_id=$2 AND kind=$3 AND archived_at IS NULL RETURNING id',[request.params.id,request.auth!.userId,request.params.kind]);
      if(row.rows[0])await audit(client,request.auth!.userId,'NUTRITION_DELETED',row.rows[0].id,{});
      return Boolean(row.rowCount);
    });
    return removed?response.status(204).send():response.status(404).json({message:'Entry not found'});
  });
  router.post('/plans/:id/assign', async (request, response) => {
    const parsed = z.object({ clientId: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success || !z.string().uuid().safeParse(request.params.id).success) return response.status(400).json({ message: 'Choose a valid client and plan.' });
    try {
      const assignment = await transaction(pool, async client => {
        // Lock the client to serialize replacement across coaches, then lock the
        // relationship so approval cannot be revoked during assignment.
        const user = await client.query('SELECT id FROM users WHERE id=$1 AND role=\'CLIENT\' AND account_status=\'APPROVED\' FOR UPDATE', [parsed.data.clientId]);
        const relationship = await client.query('SELECT id FROM coach_clients WHERE coach_id=$1 AND client_id=$2 AND status=\'APPROVED\' FOR UPDATE', [request.auth!.userId, parsed.data.clientId]);
        if (!user.rowCount || !relationship.rowCount) throw new NutritionError('Approved client not found.');
        const plan = await client.query<Entry>('SELECT id,data FROM nutrition_library WHERE id=$1 AND coach_id=$2 AND archived_at IS NULL AND kind=\'plans\'', [request.params.id, request.auth!.userId]);
        if (!plan.rows[0]) throw new NutritionError('Plan not found.');
        await client.query('UPDATE nutrition_plan_assignments SET active=false WHERE client_id=$1 AND active=true', [parsed.data.clientId]);
        const result = await client.query<{ id: string }>('INSERT INTO nutrition_plan_assignments(coach_id,client_id,plan_id,snapshot) VALUES($1,$2,$3,$4) RETURNING id', [request.auth!.userId, parsed.data.clientId, plan.rows[0].id, JSON.stringify(plan.rows[0].data)]);
        await audit(client, request.auth!.userId, 'NUTRITION_ASSIGNED', result.rows[0]!.id, { clientId: parsed.data.clientId, planId: plan.rows[0].id });
        return result.rows[0];
      });
      return response.status(201).json({ assignment });
    } catch (error) {
      if (error instanceof NutritionError) return response.status(404).json({ message: error.message });
      throw error;
    }
  });
  return router;
}

export function createNutritionClientRouter(pool: Pool): Router {
  const router = Router();
  router.get('/', async (request, response) => {
    const result = await pool.query<{ id: string; snapshot: NutritionNode; assignedAt: string }>(`SELECT a.id,a.snapshot,a.assigned_at "assignedAt" FROM nutrition_plan_assignments a JOIN coach_clients cc ON cc.coach_id=a.coach_id AND cc.client_id=a.client_id JOIN users coach ON coach.id=a.coach_id WHERE a.client_id=$1 AND a.active=true AND cc.status='APPROVED' AND coach.account_status='APPROVED'`, [request.auth!.userId]);
    response.json({ assignment: result.rows[0] ?? null });
  });
  return router;
}
