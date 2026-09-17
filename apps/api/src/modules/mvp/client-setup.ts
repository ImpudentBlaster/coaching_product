import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { dateSchema, dueDates, type Definition } from './checkin-model.js';
import { programSnapshot } from './program-snapshot.js';

const optionalId = z.string().uuid().nullable();
export const clientSetupSchema = z
  .object({
    firstName: z.string().trim().min(1).max(48),
    lastName: z.string().trim().min(1).max(48),
    email: z.email().transform((value) => value.toLowerCase()),
    birthDate: dateSchema
      .nullable()
      .refine(
        (value) => !value || value < new Date().toISOString().slice(0, 10),
        'Date of birth must be in the past',
      ),
    phone: z.string().trim().max(40),
    weightUnit: z.enum(['KG', 'LB']),
    exerciseUnit: z.enum(['KG', 'LB']),
    programId: optionalId,
    nutritionPlanId: optionalId,
    membership: z
      .object({
        name: z.string().trim().min(2).max(150),
        status: z.enum(['PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED']),
        startsOn: dateSchema,
        endsOn: dateSchema.nullable(),
        notes: z.string().max(4000),
      })
      .refine(
        (value) => !value.endsOn || value.endsOn >= value.startsOn,
        'Membership end date must follow its start date',
      )
      .nullable(),
    checkin: z
      .object({
        formId: z.string().uuid(),
        startDate: dateSchema,
        frequency: z.enum(['ONCE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
        occurrences: z.number().int().min(1).max(366),
        weekdays: z.array(z.number().int().min(0).max(6)).max(7),
      })
      .nullable(),
  })
  .strict();
export type ClientSetup = z.infer<typeof clientSetupSchema>;
class SetupError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
async function audit(c: PoolClient, actor: string, action: string, id: string) {
  await c.query(
    "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'CLIENT_SETUP',$3)",
    [actor, action, id],
  );
}
async function transaction<T>(pool: Pool, work: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await work(c);
    await c.query('COMMIT');
    return result;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
export function setupDates(schedule: NonNullable<ClientSetup['checkin']>) {
  if (
    !['WEEKLY', 'BIWEEKLY'].includes(schedule.frequency) ||
    !schedule.weekdays.length
  )
    return dueDates(
      schedule.startDate,
      schedule.frequency,
      schedule.occurrences,
    );
  const start = new Date(`${schedule.startDate}T00:00:00Z`);
  const monday = new Date(start);
  monday.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const dates: string[] = [];
  for (let offset = 0; dates.length < schedule.occurrences; offset++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + offset);
    const week = Math.floor((day.getTime() - monday.getTime()) / 604800000);
    if (
      schedule.weekdays.includes(day.getUTCDay()) &&
      (schedule.frequency === 'WEEKLY' || week % 2 === 0)
    )
      dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}
async function validateSelections(
  c: PoolClient,
  coachId: string,
  data: ClientSetup,
  previous: ClientSetup | null = null,
) {
  const programChanged = data.programId !== previous?.programId;
  const nutritionChanged = data.nutritionPlanId !== previous?.nutritionPlanId;
  const program =
    data.programId && programChanged
      ? await programSnapshot(c, data.programId, coachId)
      : null;
  if (data.programId && programChanged && !program)
    throw new SetupError(
      'Choose a published workout program belonging to you.',
      400,
    );
  const nutrition =
    data.nutritionPlanId && nutritionChanged
      ? (
          await c.query<{ data: object }>(
            "SELECT data FROM nutrition_library WHERE id=$1 AND coach_id=$2 AND kind='plans' AND archived_at IS NULL FOR SHARE",
            [data.nutritionPlanId, coachId],
          )
        ).rows[0]
      : null;
  if (data.nutritionPlanId && nutritionChanged && !nutrition)
    throw new SetupError(
      'Choose an available nutrition plan belonging to you.',
      400,
    );
  const form = data.checkin
    ? (
        await c.query<{ id: string; version: number; definition: Definition }>(
          'SELECT id,version,definition FROM checkin_forms WHERE id=$1 AND coach_id=$2 FOR SHARE',
          [data.checkin.formId, coachId],
        )
      ).rows[0]
    : null;
  if (data.checkin && !form)
    throw new SetupError('Choose a check-in form belonging to you.', 400);
  return { program, nutrition, form };
}
// Called inside the registration transaction, after the pending relationship exists.
// Account approval still controls access to all assigned content.
export async function applyClientSetup(
  c: PoolClient,
  coachId: string,
  clientId: string,
  data: ClientSetup,
  previous: ClientSetup | null = null,
) {
  if (
    !(
      await c.query(
        "SELECT id FROM users WHERE id=$1 AND role='COACH' AND account_status='APPROVED' FOR SHARE",
        [coachId],
      )
    ).rowCount
  )
    throw new SetupError('Approved coach required', 403);
  const { program, nutrition, form } = await validateSelections(
    c,
    coachId,
    data,
    previous,
  );
  await c.query(
    'UPDATE client_profiles SET display_name=$1,updated_at=now() WHERE user_id=$2',
    [`${data.firstName} ${data.lastName}`, clientId],
  );
  if (data.programId !== previous?.programId) {
    await c.query(
      'UPDATE program_assignments SET active=false WHERE coach_id=$1 AND client_id=$2 AND active',
      [coachId, clientId],
    );
    if (program)
      await c.query(
        'INSERT INTO program_assignments(coach_id,client_id,program_id,snapshot) VALUES($1,$2,$3,$4)',
        [coachId, clientId, data.programId, JSON.stringify(program)],
      );
  }
  if (data.nutritionPlanId !== previous?.nutritionPlanId) {
    await c.query(
      'UPDATE nutrition_plan_assignments SET active=false WHERE coach_id=$1 AND client_id=$2 AND active',
      [coachId, clientId],
    );
    if (nutrition)
      await c.query(
        'INSERT INTO nutrition_plan_assignments(coach_id,client_id,plan_id,snapshot) VALUES($1,$2,$3,$4)',
        [
          coachId,
          clientId,
          data.nutritionPlanId,
          JSON.stringify(nutrition.data),
        ],
      );
  }
  if (
    JSON.stringify(data.membership) !==
    JSON.stringify(previous?.membership ?? null)
  ) {
    if (data.membership) {
      const m = data.membership;
      await c.query(
        'INSERT INTO subscriptions(coach_id,client_id,plan_name,status,starts_on,ends_or_renews_on,notes) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(coach_id,client_id) DO UPDATE SET plan_name=excluded.plan_name,status=excluded.status,starts_on=excluded.starts_on,ends_or_renews_on=excluded.ends_or_renews_on,notes=excluded.notes,updated_at=now()',
        [coachId, clientId, m.name, m.status, m.startsOn, m.endsOn, m.notes],
      );
    } else
      await c.query(
        "UPDATE subscriptions SET status='CANCELLED',updated_at=now() WHERE coach_id=$1 AND client_id=$2",
        [coachId, clientId],
      );
  }
  if (
    data.checkin &&
    form &&
    JSON.stringify(data.checkin) !== JSON.stringify(previous?.checkin ?? null)
  ) {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${coachId}:${clientId}`,
    ]);
    const schedule = randomUUID();
    for (const date of setupDates(data.checkin)) {
      const existing = await c.query(
        'SELECT id FROM checkin_assignments WHERE coach_id=$1 AND client_id=$2 AND form_id=$3 AND due_date=$4',
        [coachId, clientId, form.id, date],
      );
      if (existing.rowCount) continue;
      const id = randomUUID();
      await c.query(
        'INSERT INTO checkin_assignments(id,coach_id,client_id,due_date,form_id,form_version,form_snapshot,schedule_id,frequency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          id,
          coachId,
          clientId,
          date,
          form.id,
          form.version,
          JSON.stringify(form.definition),
          schedule,
          data.checkin.frequency,
        ],
      );
      await c.query(
        "INSERT INTO checkin_logs(assignment_id,actor_id,action,revision,snapshot) VALUES($1,$2,'CHECKIN_ASSIGNED',0,$3)",
        [
          id,
          coachId,
          JSON.stringify({
            dueDate: date,
            formId: form.id,
            formVersion: form.version,
          }),
        ],
      );
      await audit(c, coachId, 'CHECKIN_ASSIGNED', id);
    }
  }
  await c.query(
    'INSERT INTO client_setup(coach_id,client_id,data) VALUES($1,$2,$3) ON CONFLICT(coach_id,client_id) DO UPDATE SET data=excluded.data,revision=client_setup.revision+1,updated_at=now()',
    [coachId, clientId, JSON.stringify(data)],
  );
  await audit(c, coachId, 'CLIENT_SETUP_SAVED', clientId);
}
async function loadClient(c: PoolClient, coachId: string, clientId: string) {
  const row = (
    await c.query<{ email: string; display_name: string }>(
      "SELECT u.email::text,cp.display_name FROM coach_clients cc JOIN users u ON u.id=cc.client_id JOIN client_profiles cp ON cp.user_id=u.id WHERE cc.coach_id=$1 AND cc.client_id=$2 AND cc.status IN ('APPROVED','PENDING_REVIEW') FOR UPDATE OF cc",
      [coachId, clientId],
    )
  ).rows[0];
  if (!row) throw new SetupError('Client not found', 404);
  const saved = (
    await c.query<{ data: ClientSetup; revision: number }>(
      'SELECT data,revision FROM client_setup WHERE coach_id=$1 AND client_id=$2',
      [coachId, clientId],
    )
  ).rows[0];
  const names = row.display_name.split(' ');
  const data: ClientSetup = saved?.data ?? {
    firstName: names.shift() ?? '',
    lastName: names.join(' '),
    email: row.email,
    birthDate: null,
    phone: '',
    weightUnit: 'KG',
    exerciseUnit: 'KG',
    programId: null,
    nutritionPlanId: null,
    membership: null,
    checkin: null,
  };
  data.email = row.email;
  data.programId =
    (
      await c.query<{ program_id: string }>(
        'SELECT program_id FROM program_assignments WHERE coach_id=$1 AND client_id=$2 AND active',
        [coachId, clientId],
      )
    ).rows[0]?.program_id ?? null;
  data.nutritionPlanId =
    (
      await c.query<{ plan_id: string }>(
        'SELECT plan_id FROM nutrition_plan_assignments WHERE coach_id=$1 AND client_id=$2 AND active',
        [coachId, clientId],
      )
    ).rows[0]?.plan_id ?? null;
  const membership = (
    await c.query<NonNullable<ClientSetup['membership']>>(
      'SELECT plan_name name,status,starts_on::text "startsOn",ends_or_renews_on::text "endsOn",notes FROM subscriptions WHERE coach_id=$1 AND client_id=$2',
      [coachId, clientId],
    )
  ).rows[0];
  data.membership = membership ?? null;
  return { data, revision: saved?.revision ?? 0 };
}
export function createClientSetupRouter(pool: Pool): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    const data = clientSetupSchema.parse(req.body);
    const token = randomBytes(32).toString('base64url');
    const invitation = await transaction(pool, async (c) => {
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
        req.auth!.userId,
      ]);
      await validateSelections(c, req.auth!.userId, data);
      if (
        (await c.query('SELECT id FROM users WHERE email=$1', [data.email]))
          .rowCount
      )
        throw new SetupError(
          'This email already has an account. Edit the existing client instead.',
        );
      if (
        (
          await c.query(
            'SELECT id FROM client_invitations WHERE coach_id=$1 AND email=$2 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now()',
            [req.auth!.userId, data.email],
          )
        ).rowCount
      )
        throw new SetupError(
          'An invitation is already pending for this email.',
        );
      const row = (
        await c.query<{ id: string }>(
          "INSERT INTO client_invitations(coach_id,email,token_hash,expires_at,setup) VALUES($1,$2,$3,now()+interval '7 days',$4) RETURNING id",
          [
            req.auth!.userId,
            data.email,
            createHash('sha256').update(token).digest('hex'),
            JSON.stringify(data),
          ],
        )
      ).rows[0]!;
      await audit(c, req.auth!.userId, 'CLIENT_SETUP_INVITED', row.id);
      return row;
    });
    res.status(201).json({ invitation: { ...invitation, token } });
  });
  router.get('/invitations/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const row = (
      await pool.query<{
        data: ClientSetup | null;
        revision: number;
        email: string;
      }>(
        'SELECT setup data,setup_revision revision,email::text FROM client_invitations WHERE id=$1 AND coach_id=$2 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now()',
        [id, req.auth!.userId],
      )
    ).rows[0];
    if (!row) throw new SetupError('Pending invitation not found', 404);
    res.json({
      data: row.data ?? {
        firstName: '',
        lastName: '',
        email: row.email,
        birthDate: null,
        phone: '',
        weightUnit: 'KG',
        exerciseUnit: 'KG',
        programId: null,
        nutritionPlanId: null,
        membership: null,
        checkin: null,
      },
      revision: row.revision,
    });
  });
  router.put('/invitations/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const input = z
      .object({
        data: clientSetupSchema,
        revision: z.number().int().positive(),
      })
      .strict()
      .parse(req.body);
    await transaction(pool, async (c) => {
      const row = (
        await c.query<{ setup_revision: number }>(
          'SELECT setup_revision FROM client_invitations WHERE id=$1 AND coach_id=$2 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',
          [id, req.auth!.userId],
        )
      ).rows[0];
      if (!row) throw new SetupError('Pending invitation not found', 404);
      if (row.setup_revision !== input.revision)
        throw new SetupError('This invitation changed. Reload before saving.');
      await validateSelections(c, req.auth!.userId, input.data);
      if (
        (
          await c.query('SELECT id FROM users WHERE email=$1', [
            input.data.email,
          ])
        ).rowCount
      )
        throw new SetupError('This email already has an account.');
      await c.query(
        'UPDATE client_invitations SET email=$1,setup=$2,setup_revision=setup_revision+1 WHERE id=$3',
        [input.data.email, JSON.stringify(input.data), id],
      );
      await audit(c, req.auth!.userId, 'CLIENT_INVITATION_UPDATED', id);
    });
    res.json({ saved: true });
  });
  router.get('/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json(
      await transaction(pool, (c) => loadClient(c, req.auth!.userId, id)),
    );
  });
  router.put('/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const input = z
      .object({
        data: clientSetupSchema,
        revision: z.number().int().nonnegative(),
      })
      .strict()
      .parse(req.body);
    await transaction(pool, async (c) => {
      const previous = await loadClient(c, req.auth!.userId, id);
      if (previous.revision !== input.revision)
        throw new SetupError('This client changed. Reload before saving.');
      if (previous.data.email !== input.data.email)
        throw new SetupError('Account email cannot be changed here.', 400);
      await applyClientSetup(
        c,
        req.auth!.userId,
        id,
        input.data,
        previous.data,
      );
    });
    res.json({ saved: true });
  });
  router.use(
    (
      error: unknown,
      _req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({
            message: 'Check the client details.',
            details: error.flatten(),
          });
        return;
      }
      if (error instanceof SetupError) {
        res.status(error.status).json({ message: error.message });
        return;
      }
      next(error);
    },
  );
  return router;
}
