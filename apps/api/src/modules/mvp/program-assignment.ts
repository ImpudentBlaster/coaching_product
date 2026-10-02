import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../identity/auth.js';
import { programSnapshot } from './program-snapshot.js';

const assignmentInput = z.union([
  z.object({ clientIds: z.array(z.string().uuid()).min(1).max(100) }).strict(),
  z.object({ clientId: z.string().uuid() }).strict(),
]);
class AssignmentError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function createProgramAssignmentRouter(pool: Pool): Router {
  const router = Router();
  router.get('/assignment-clients', async (request: AuthenticatedRequest, response) => {
    const input = z.object({ q: z.string().trim().max(180).default(''), programId: z.string().uuid().optional() }).safeParse(request.query);
    if (!input.success) return response.status(400).json({ message: 'Invalid client search' });
    if (!input.data.q) return response.json({ items: [], hasMore: false });
    if (input.data.programId) {
      const owned = await pool.query('SELECT id FROM programs WHERE id=$1 AND coach_id=$2', [input.data.programId, request.auth!.userId]);
      if (!owned.rowCount) return response.status(404).json({ message: 'Program not found' });
    }
    const result = await pool.query<{ id: string; name: string; email: string; assignmentId: string | null }>(`
      SELECT u.id,COALESCE(cp.display_name,u.email) AS name,u.email,
        (SELECT pa.id FROM program_assignments pa WHERE pa.client_id=u.id AND pa.coach_id=$1 AND pa.program_id=$3 AND pa.active LIMIT 1) "assignmentId"
      FROM coach_clients cc JOIN users u ON u.id=cc.client_id
      LEFT JOIN client_profiles cp ON cp.user_id=u.id
      WHERE cc.coach_id=$1 AND cc.status='APPROVED' AND u.account_status='APPROVED' AND u.role='CLIENT'
      AND ($2='' OR strpos(lower(COALESCE(cp.display_name,'')),lower($2))>0 OR strpos(lower(u.email),lower($2))>0)
      ORDER BY lower(COALESCE(cp.display_name,u.email)),u.id LIMIT 51`, [request.auth!.userId, input.data.q, input.data.programId ?? null]);
    return response.json({ items: result.rows.slice(0,50), hasMore: result.rows.length > 50 });
  });
  router.get('/:id/assignments', async (request: AuthenticatedRequest, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const page = z.coerce.number().int().min(0).max(100000).safeParse(request.query.offset ?? 0);
    if (!id.success || !page.success) return response.status(400).json({ message: 'Invalid assignment request' });
    const owned = await pool.query('SELECT id FROM programs WHERE id=$1 AND coach_id=$2', [id.data, request.auth!.userId]);
    if (!owned.rowCount) return response.status(404).json({ message: 'Program not found' });
    const result = await pool.query<{ id: string; clientId: string; name: string; email: string }>(`
      SELECT pa.id,pa.client_id "clientId",COALESCE(cp.display_name,u.email) name,u.email
      FROM program_assignments pa JOIN users u ON u.id=pa.client_id
      JOIN coach_clients cc ON cc.coach_id=pa.coach_id AND cc.client_id=pa.client_id AND cc.status='APPROVED'
      LEFT JOIN client_profiles cp ON cp.user_id=u.id
      WHERE pa.program_id=$1 AND pa.coach_id=$2 AND pa.active
      ORDER BY pa.assigned_at DESC,pa.id LIMIT 21 OFFSET $3`, [id.data, request.auth!.userId, page.data]);
    return response.json({ items: result.rows.slice(0,20), hasMore: result.rows.length > 20 });
  });
  router.delete('/:id/assignments/:assignmentId', async (request: AuthenticatedRequest, response, next) => {
    const input = z.object({ id: z.string().uuid(), assignmentId: z.string().uuid() }).safeParse(request.params);
    if (!input.success) return response.status(400).json({ message: 'Invalid assignment' });
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const owned = await connection.query('SELECT id FROM programs WHERE id=$1 AND coach_id=$2 FOR UPDATE', [input.data.id, request.auth!.userId]);
      if (!owned.rowCount) throw new AssignmentError(404, 'Program not found');
      const removed = await connection.query<{ client_id: string }>('UPDATE program_assignments SET active=false WHERE id=$1 AND program_id=$2 AND coach_id=$3 AND active RETURNING client_id', [input.data.assignmentId, input.data.id, request.auth!.userId]);
      if (!removed.rowCount) throw new AssignmentError(404, 'Assignment is no longer active. Refresh the assigned clients.');
      await connection.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'PROGRAM_UNASSIGNED','PROGRAM_ASSIGNMENT',$2,$3)`, [request.auth!.userId, input.data.assignmentId, { programId: input.data.id, clientId: removed.rows[0]!.client_id }]);
      await connection.query('COMMIT');
      return response.status(204).send();
    } catch (error) {
      await connection.query('ROLLBACK');
      if (error instanceof AssignmentError) return response.status(error.status).json({ message: error.message });
      return next(error);
    } finally { connection.release(); }
  });
  router.post('/:id/assign', async (request: AuthenticatedRequest, response, next) => {
    const input = assignmentInput.safeParse(request.body);
    const id = z.string().uuid().safeParse(request.params.id);
    if (!input.success || !id.success) return response.status(400).json({ message: 'Choose between 1 and 100 clients and a valid program.' });
    const clientIds = [...new Set('clientIds' in input.data ? input.data.clientIds : [input.data.clientId])].sort();
    const coachId = request.auth!.userId;
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const snapshot = await programSnapshot(connection, id.data, coachId);
      if (!snapshot) throw new AssignmentError(409, 'Publish the program before assignment');
      const clients = await connection.query<{ client_id: string }>(`
        SELECT cc.client_id FROM coach_clients cc JOIN users u ON u.id=cc.client_id
        WHERE cc.coach_id=$1 AND cc.client_id=ANY($2::uuid[]) AND cc.status='APPROVED'
          AND u.account_status='APPROVED' AND u.role='CLIENT'
        ORDER BY cc.client_id FOR UPDATE OF cc,u`, [coachId, clientIds]);
      if (clients.rowCount !== clientIds.length) throw new AssignmentError(404, 'One or more selected clients are no longer available. Review your selection.');
      const assignments: Array<{ id: string; clientId: string; assignedAt: string }> = [];
      for (const clientId of clientIds) {
        await connection.query('UPDATE program_assignments SET active=false WHERE coach_id=$1 AND client_id=$2 AND active=true', [coachId, clientId]);
        const saved = await connection.query<{ id: string; clientId: string; assignedAt: string }>(`INSERT INTO program_assignments(coach_id,client_id,program_id,snapshot) VALUES($1,$2,$3,$4) RETURNING id,client_id "clientId",assigned_at "assignedAt"`, [coachId, clientId, id.data, snapshot]);
        const assignment = saved.rows[0]!;
        await connection.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'PROGRAM_ASSIGNED','PROGRAM_ASSIGNMENT',$2,$3)`, [coachId, assignment.id, { programId: id.data, clientId }]);
        assignments.push(assignment);
      }
      await connection.query('COMMIT');
      return response.status(201).json({ assignments, ...('clientId' in input.data ? { assignment: assignments[0] } : {}) });
    } catch (error) {
      await connection.query('ROLLBACK');
      if (error instanceof AssignmentError) return response.status(error.status).json({ message: error.message });
      return next(error);
    } finally { connection.release(); }
  });
  return router;
}
