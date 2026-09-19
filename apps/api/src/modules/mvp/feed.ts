import { Router, json, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { Environment } from '../../config/environment.js';
import { authenticate } from '../identity/auth.js';
import { normalizeCheckinPhoto } from './checkin-photo-storage.js';

const uuid = z.string().uuid();
const attachmentSchema = z.object({ name: z.string().trim().min(1).max(180), image: z.boolean(), data: z.string().max(13981016) });
export const feedPostSchema = z.object({ body: z.string().trim().max(5000), attachments: z.array(attachmentSchema).max(4).default([]) })
  .refine(value => value.body.length > 0 || value.attachments.length > 0, 'Add a status, photo or file.');
type Attachment = { name: string; mediaType: string; bytes: Buffer };
type Context = { actor: string; coach: string; role: string };
class FeedError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function prepareFeedAttachments(input: z.infer<typeof attachmentSchema>[]): Promise<Attachment[]> {
  let total = 0;
  const output: Attachment[] = [];
  for (const file of input) {
    if (file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw new FeedError(400, 'Invalid file encoding.');
    const bytes = Buffer.from(file.data, 'base64');
    if (bytes.toString('base64') !== file.data) throw new FeedError(400, 'Invalid file encoding.');
    total += bytes.length;
    if (!bytes.length || bytes.length > 10 * 1024 * 1024 || total > 20 * 1024 * 1024) throw new FeedError(400, 'Use files up to 10 MB each and 20 MB per post.');
    // eslint-disable-next-line no-control-regex -- explicitly strip control characters from downloaded filenames
    const name = file.name.replace(/[\u0000-\u001f\u007f/\\<>:"|?*]/g, '_');
    if (file.image) {
      try { output.push({ name: `${name.replace(/\.[^.]*$/, '')}.jpg`, mediaType: 'image/jpeg', bytes: await normalizeCheckinPhoto(bytes) }); }
      catch (error) { throw new FeedError(400, error instanceof Error ? error.message : 'Invalid photo.'); }
    } else output.push({ name, mediaType: 'application/octet-stream', bytes });
  }
  return output;
}

// Locks keep membership/account changes from racing a read or write. Never trust
// a coach ID, role or approval claim supplied by the browser or an older JWT.
async function context(client: PoolClient, actor: string): Promise<Context> {
  const user = (await client.query<{ role: string; account_status: string }>('SELECT role,account_status FROM users WHERE id=$1 FOR SHARE', [actor])).rows[0];
  if (!user || user.account_status !== 'APPROVED' || !['COACH', 'CLIENT'].includes(user.role)) throw new FeedError(403, 'An approved coach or client account is required.');
  if (user.role === 'COACH') return { actor, coach: actor, role: user.role };
  const membership = (await client.query<{ coach_id: string }>(`SELECT cc.coach_id FROM coach_clients cc JOIN users u ON u.id=cc.coach_id
    WHERE cc.client_id=$1 AND cc.status='APPROVED' AND u.account_status='APPROVED' AND u.role='COACH' FOR SHARE OF cc,u`, [actor])).rows[0];
  if (!membership) throw new FeedError(403, 'An approved coach relationship is required to join the community.');
  return { actor, coach: membership.coach_id, role: user.role };
}
async function audit(client: PoolClient, ctx: Context, action: string, id: string) {
  await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'FEED',$3,$4)", [ctx.actor, action, id, { coachId: ctx.coach }]);
}
async function post(client: PoolClient, ctx: Context, id: string) {
  const row = (await client.query<{ author_id: string }>('SELECT author_id FROM feed_posts WHERE id=$1 AND coach_id=$2 FOR UPDATE', [id, ctx.coach])).rows[0];
  if (!row) throw new FeedError(404, 'Post not found.');
  return row;
}
const authorJoins = 'LEFT JOIN coach_profiles cp ON cp.user_id=p.author_id LEFT JOIN client_profiles cl ON cl.user_id=p.author_id';
const authorName = "COALESCE(cp.display_name,cl.display_name,'Community member')";

export function createFeedRouter(environment: Environment, pool: Pool): Router {
  const router = Router();
  router.use(authenticate(environment));
  router.use(rateLimit({ windowMs: 60000, limit: 120, keyGenerator: request => request.auth!.userId, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many requests. Please try again in a minute.' } }));
  router.use(json({ limit: '29mb' }));
  type Work = (client: PoolClient, ctx: Context, request: Request) => Promise<{ status?: number; body?: unknown; file?: Attachment }>;
  const run = (work: Work) => async (request: Request, response: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ctx = await context(client, request.auth!.userId);
      for (const value of Object.values(request.params)) if (!uuid.safeParse(value).success) throw new FeedError(400, 'Invalid resource ID.');
      const result = await work(client, ctx, request);
      await client.query('COMMIT');
      response.set('Cache-Control', 'private, no-store');
      if (result.file) {
        response.set({ 'Content-Type': result.file.mediaType, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Content-Disposition': `${result.file.mediaType === 'image/jpeg' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(result.file.name).replace(/'/g, '%27')}` });
        response.send(result.file.bytes);
      } else response.status(result.status ?? 200).json(result.body);
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof FeedError) response.status(error.status).json({ message: error.message });
      else if (error instanceof z.ZodError) response.status(400).json({ message: 'Check your post or attachment fields.' });
      else next(error);
    } finally { client.release(); }
  };

  router.get('/posts', run(async (client, ctx, request) => {
    const query = z.object({ before: uuid.optional(), filter: z.enum(['all', 'mine', 'photos', 'files']).default('all') }).parse(request.query);
    const result = await client.query<{ id: string }>(`SELECT p.id,p.body,p.author_id "authorId",${authorName} "authorName",
      (p.author_id=p.coach_id) "isCoach",p.created_at "createdAt",(p.author_id=$2 OR p.coach_id=$2) "canDelete",
      (SELECT count(*)::int FROM feed_likes l WHERE l.post_id=p.id) "likeCount",
      EXISTS(SELECT 1 FROM feed_likes l WHERE l.post_id=p.id AND l.user_id=$2) liked,
      (SELECT count(*)::int FROM feed_comments c WHERE c.post_id=p.id) "commentCount",
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'name',a.name,'mediaType',a.media_type,'size',octet_length(a.bytes)) ORDER BY a.id) FROM feed_attachments a WHERE a.post_id=p.id),'[]') attachments
      FROM feed_posts p ${authorJoins} WHERE p.coach_id=$1
      AND ($3::uuid IS NULL OR (p.created_at,p.id)<(SELECT created_at,id FROM feed_posts WHERE id=$3 AND coach_id=$1))
      AND ($4='all' OR ($4='mine' AND p.author_id=$2) OR ($4='photos' AND EXISTS(SELECT 1 FROM feed_attachments a WHERE a.post_id=p.id AND a.media_type='image/jpeg')) OR ($4='files' AND EXISTS(SELECT 1 FROM feed_attachments a WHERE a.post_id=p.id AND a.media_type='application/octet-stream')))
      ORDER BY p.created_at DESC,p.id DESC LIMIT 21`, [ctx.coach, ctx.actor, query.before ?? null, query.filter]);
    const items = result.rows.slice(0, 20);
    const community = (await client.query<{ name: string }>('SELECT business_name name FROM coach_profiles WHERE user_id=$1', [ctx.coach])).rows[0]?.name ?? 'Your coaching community';
    return { body: { items, nextCursor: result.rows.length > 20 ? items.at(-1)!.id : null, community } };
  }));
  router.post('/posts', run(async (client, ctx, request) => {
    const input = feedPostSchema.parse(request.body);
    const files = await prepareFeedAttachments(input.attachments);
    // Serialize per-author quota checks, including concurrent uploads.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [ctx.actor]);
    const used = (await client.query<{ size: string }>('SELECT COALESCE(sum(octet_length(a.bytes)),0)::text size FROM feed_attachments a JOIN feed_posts p ON p.id=a.post_id WHERE p.author_id=$1', [ctx.actor])).rows[0]!;
    if (Number(used.size) + files.reduce((sum, file) => sum + file.bytes.length, 0) > 200 * 1024 * 1024) throw new FeedError(409, 'Your 200 MB attachment limit is reached. Remove older posts to free space.');
    const row = (await client.query<{ id: string }>('INSERT INTO feed_posts(coach_id,author_id,body) VALUES($1,$2,$3) RETURNING id', [ctx.coach, ctx.actor, input.body])).rows[0]!;
    for (const file of files) await client.query('INSERT INTO feed_attachments(post_id,name,media_type,bytes) VALUES($1,$2,$3,$4)', [row.id, file.name.slice(0, 180), file.mediaType, file.bytes]);
    await audit(client, ctx, 'FEED_POST_CREATED', row.id);
    return { status: 201, body: row };
  }));
  router.delete('/posts/:id', run(async (client, ctx, request) => {
    const id = String(request.params.id);
    const row = await post(client, ctx, id);
    if (row.author_id !== ctx.actor && ctx.role !== 'COACH') throw new FeedError(403, 'Only the author or coach can remove this post.');
    await client.query('DELETE FROM feed_posts WHERE id=$1', [id]);
    await audit(client, ctx, 'FEED_POST_DELETED', id);
    return { status: 204 };
  }));
  router.put('/posts/:id/like', run(async (client, ctx, request) => {
    const { liked } = z.object({ liked: z.boolean() }).parse(request.body);
    const id = String(request.params.id);
    await post(client, ctx, id);
    const result = liked ? await client.query('INSERT INTO feed_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, ctx.actor]) : await client.query('DELETE FROM feed_likes WHERE post_id=$1 AND user_id=$2', [id, ctx.actor]);
    if (result.rowCount) await audit(client, ctx, liked ? 'FEED_POST_LIKED' : 'FEED_POST_UNLIKED', id);
    return { body: { liked } };
  }));
  router.get('/posts/:id/comments', run(async (client, ctx, request) => {
    const id = String(request.params.id);
    await post(client, ctx, id);
    const { before } = z.object({ before: uuid.optional() }).parse(request.query);
    const rows = (await client.query<{ id: string }>(`SELECT p.id,p.body,${authorName} "authorName",p.created_at "createdAt",(p.author_id=$2 OR $3=$2) "canDelete"
      FROM feed_comments p ${authorJoins} WHERE p.post_id=$1
      AND ($4::uuid IS NULL OR (p.created_at,p.id)<(SELECT created_at,id FROM feed_comments WHERE id=$4 AND post_id=$1))
      ORDER BY p.created_at DESC,p.id DESC LIMIT 21`, [id, ctx.actor, ctx.coach, before ?? null])).rows;
    return { body: { items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19]!.id : null } };
  }));
  router.post('/posts/:id/comments', run(async (client, ctx, request) => {
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(request.body);
    const id = String(request.params.id);
    await post(client, ctx, id);
    const row = (await client.query<{ id: string }>('INSERT INTO feed_comments(post_id,author_id,body) VALUES($1,$2,$3) RETURNING id', [id, ctx.actor, body])).rows[0]!;
    await audit(client, ctx, 'FEED_COMMENT_CREATED', row.id);
    return { status: 201, body: row };
  }));
  router.delete('/posts/:id/comments/:commentId', run(async (client, ctx, request) => {
    await post(client, ctx, String(request.params.id));
    const row = await client.query('DELETE FROM feed_comments WHERE id=$1 AND post_id=$2 AND (author_id=$3 OR $3=$4) RETURNING id', [request.params.commentId, request.params.id, ctx.actor, ctx.coach]);
    if (!row.rowCount) throw new FeedError(404, 'Comment not found or cannot be removed.');
    await audit(client, ctx, 'FEED_COMMENT_DELETED', String(request.params.commentId));
    return { status: 204 };
  }));
  router.get('/posts/:id/attachments/:attachmentId', run(async (client, ctx, request) => {
    await post(client, ctx, String(request.params.id));
    const file = (await client.query<Attachment>('SELECT name,media_type "mediaType",bytes FROM feed_attachments WHERE id=$1 AND post_id=$2', [request.params.attachmentId, request.params.id])).rows[0];
    if (!file) throw new FeedError(404, 'Attachment not found.');
    return { file };
  }));
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof SyntaxError) response.status(400).json({ message: 'Invalid post data.' });
    else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') response.status(413).json({ message: 'Attachments exceed the 20 MB post limit.' });
    else next(error);
  });
  return router;
}
