import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateEnvironment } from '../../config/environment.js';
import { issueAccessToken } from '../identity/auth.js';
import { createFeedRouter, feedPostSchema, prepareFeedAttachments } from './feed.js';

it('rejects empty posts, malformed encoding, too many files and over-sized uploads', async () => {
  expect(feedPostSchema.safeParse({ body: '  ' }).success).toBe(false);
  expect(feedPostSchema.safeParse({ body: 'a'.repeat(5001) }).success).toBe(false);
  expect(feedPostSchema.safeParse({ body: 'hello', attachments: Array(5).fill({ name: 'x', image: false, data: 'YQ==' }) }).success).toBe(false);
  await expect(prepareFeedAttachments([{ name: 'x', image: false, data: '%%%=' }])).rejects.toThrow('encoding');
  await expect(prepareFeedAttachments([{ name: 'x', image: false, data: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64') }])).rejects.toThrow('10 MB');
  await expect(prepareFeedAttachments([{ name: 'fake.jpg', image: true, data: Buffer.from('<html>unsafe</html>').toString('base64') }])).rejects.toThrow('valid');
});
it('normalizes image bytes and keeps arbitrary files as downloads with safe names', async () => {
  const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#009966' } }).png().toBuffer();
  const result = await prepareFeedAttachments([{ name: 'photo.png', image: true, data: photo.toString('base64') }, { name: '../evil\r\n.html', image: false, data: Buffer.from('<script>alert(1)</script>').toString('base64') }]);
  expect((await sharp(result[0]!.bytes).metadata()).format).toBe('jpeg');
  expect(result[1]!.mediaType).toBe('application/octet-stream');
  expect(result[1]!.name).not.toMatch(/[/\r\n]/);
});

describe.skipIf(!process.env.DATABASE_URL)('community feed PostgreSQL authorization and transactions', () => {
  const schema = `feed_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
  const env = validateEnvironment({ DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://localhost/unused', JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), NODE_ENV: 'test' });
  const coach = randomUUID(), other = randomUUID(), client = randomUUID(), peer = randomUUID(), pending = randomUUID(), administrator = randomUUID();
  const token = (id: string, role: 'COACH' | 'CLIENT' | 'PLATFORM_ADMIN' = 'CLIENT') => `Bearer ${issueAccessToken(env, { id, role })}`;
  const app = express(); app.use('/feed', createFeedRouter(env, pool));
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const file of ['001_identity_approvals.sql', '008_community_feed.sql']) await pool.query(await readFile(new URL(`../../../db/migrations/${file}`, import.meta.url), 'utf8'));
    for (const [id, role] of [[coach, 'COACH'], [other, 'COACH'], [client, 'CLIENT'], [peer, 'CLIENT'], [pending, 'CLIENT'], [administrator, 'PLATFORM_ADMIN']]) {
      await pool.query("INSERT INTO users(id,email,password_hash,role,account_status) VALUES($1,$2,'unused-test-hash',$3,'APPROVED')", [id, `${id}@example.test`, role]);
      if (role === 'COACH') await pool.query("INSERT INTO coach_profiles(user_id,display_name,business_name) VALUES($1,'Test coach','Test community')", [id]);
      if (role === 'CLIENT') await pool.query("INSERT INTO client_profiles(user_id,display_name) VALUES($1,'Test client')", [id]);
    }
    for (const id of [client, peer, pending]) await pool.query('INSERT INTO coach_clients(coach_id,client_id,status) VALUES($1,$2,$3)', [coach, id, id === pending ? 'PENDING_REVIEW' : 'APPROVED']);
  });
  afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });
  const create = (body = 'A training win', actor = client) => request(app).post('/feed/posts').set('Authorization', token(actor)).send({ body });
  it('requires live approval and isolates the timeline, comments, reactions and attachments', async () => {
    expect((await request(app).get('/feed/posts')).status).toBe(401);
    for (const actor of [pending, administrator]) expect((await request(app).get('/feed/posts').set('Authorization', token(actor))).status).toBe(403);
    const created = await request(app).post('/feed/posts').set('Authorization', token(client)).send({ body: 'Resource', attachments: [{ name: 'guide.html', image: false, data: Buffer.from('<b>Guide</b>').toString('base64') }] });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const listing = await request(app).get('/feed/posts').set('Authorization', token(peer));
    const item = (listing.body as { items: { id: string; attachments: { id: string }[] }[] }).items[0]!;
    expect(item.id).toBe(id);
    const filePath = `/feed/posts/${id}/attachments/${item.attachments[0]!.id}`;
    const downloaded = await request(app).get(filePath).set('Authorization', token(peer));
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toContain('application/octet-stream');
    expect(downloaded.headers['content-disposition']).toContain('attachment;');
    expect(downloaded.headers['cache-control']).toBe('private, no-store');
    expect((await request(app).get('/feed/posts').set('Authorization', token(other, 'COACH'))).body).toMatchObject({ items: [] });
    for (const path of [filePath, `/feed/posts/${id}/comments`]) expect((await request(app).get(path).set('Authorization', token(other, 'COACH'))).status).toBe(404);
    expect((await request(app).put(`/feed/posts/${id}/like`).set('Authorization', token(other, 'COACH')).send({ liked: true })).status).toBe(404);
    expect((await request(app).post(`/feed/posts/${id}/comments`).set('Authorization', token(other, 'COACH')).send({ body: 'intrusion' })).status).toBe(404);
    expect((await request(app).delete(`/feed/posts/${id}`).set('Authorization', token(peer))).status).toBe(403);
    await pool.query("UPDATE coach_clients SET status='SUSPENDED' WHERE client_id=$1", [peer]);
    expect((await request(app).get(filePath).set('Authorization', token(peer))).status).toBe(403);
    await pool.query("UPDATE coach_clients SET status='APPROVED' WHERE client_id=$1", [peer]);
    await pool.query("UPDATE users SET account_status='SUSPENDED' WHERE id=$1", [coach]);
    expect((await request(app).get('/feed/posts').set('Authorization', token(client))).status).toBe(403);
    await pool.query("UPDATE users SET account_status='APPROVED' WHERE id=$1", [coach]);
  });
  it('supports idempotent likes, comments and coach moderation with atomic audits', async () => {
    const id = ((await create()).body as { id: string }).id;
    for (let index = 0; index < 2; index++) expect((await request(app).put(`/feed/posts/${id}/like`).set('Authorization', token(peer)).send({ liked: true })).status).toBe(200);
    expect((await pool.query('SELECT 1 FROM feed_likes WHERE post_id=$1', [id])).rowCount).toBe(1);
    expect((await pool.query("SELECT 1 FROM audit_events WHERE entity_id=$1 AND action='FEED_POST_LIKED'", [id])).rowCount).toBe(1);
    const comment = await request(app).post(`/feed/posts/${id}/comments`).set('Authorization', token(peer)).send({ body: 'Great work!' });
    expect(comment.status).toBe(201);
    const commentId = (comment.body as { id: string }).id;
    expect((await request(app).delete(`/feed/posts/${id}/comments/${commentId}`).set('Authorization', token(client))).status).toBe(404);
    expect((await request(app).delete(`/feed/posts/${id}/comments/${commentId}`).set('Authorization', token(coach, 'COACH'))).status).toBe(204);
    await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_feed_delete CHECK(action <> 'FEED_POST_DELETED') NOT VALID");
    expect((await request(app).delete(`/feed/posts/${id}`).set('Authorization', token(client))).status).toBe(500);
    expect((await pool.query('SELECT 1 FROM feed_posts WHERE id=$1', [id])).rowCount).toBe(1);
    await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_feed_delete');
    expect((await request(app).delete(`/feed/posts/${id}`).set('Authorization', token(coach, 'COACH'))).status).toBe(204);
    expect((await pool.query('SELECT 1 FROM feed_likes WHERE post_id=$1', [id])).rowCount).toBe(0);
  });
  it('rolls back post and attachment creation when its audit cannot be written', async () => {
    await pool.query("ALTER TABLE audit_events ADD CONSTRAINT fail_feed_create CHECK(action <> 'FEED_POST_CREATED') NOT VALID");
    const count = (await pool.query<{ count: string }>('SELECT count(*) FROM feed_posts')).rows[0]!.count;
    expect((await request(app).post('/feed/posts').set('Authorization', token(client)).send({ body: 'Must rollback', attachments: [{ name: 'notes.txt', image: false, data: 'YQ==' }] })).status).toBe(500);
    expect((await pool.query<{ count: string }>('SELECT count(*) FROM feed_posts')).rows[0]!.count).toBe(count);
    expect((await pool.query("SELECT 1 FROM feed_attachments WHERE name='notes.txt'")).rowCount).toBe(0);
    await pool.query('ALTER TABLE audit_events DROP CONSTRAINT fail_feed_create');
  });
  it('paginates stable timelines and filters files, photos and own posts', async () => {
    for (let index = 0; index < 22; index++) await create(`Post ${index}`, peer);
    const first = (await request(app).get('/feed/posts?filter=mine').set('Authorization', token(peer))).body as { items: { id: string }[]; nextCursor: string };
    expect(first.items).toHaveLength(20);
    const next = (await request(app).get(`/feed/posts?filter=mine&before=${first.nextCursor}`).set('Authorization', token(peer))).body as { items: { id: string }[]; nextCursor: null };
    expect(next.items).toHaveLength(2);
    expect(next.nextCursor).toBeNull();
    expect(first.items.some(item => next.items.some(other => item.id === other.id))).toBe(false);
    expect((await request(app).get('/feed/posts?filter=photos').set('Authorization', token(client))).body).toMatchObject({ items: [] });
    const files = (await request(app).get('/feed/posts?filter=files').set('Authorization', token(client))).body as { items: unknown[] };
    expect(files.items).toHaveLength(1);
    expect((await request(app).get('/feed/posts?filter=unknown').set('Authorization', token(client))).status).toBe(400);
    expect((await request(app).delete('/feed/posts/not-an-id').set('Authorization', token(client))).status).toBe(400);
  });
  it('publishes photo-only posts and removes private bytes with the post', async () => {
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#009966' } }).png().toBuffer();
    const created = await request(app).post('/feed/posts').set('Authorization', token(client)).send({ body: '', attachments: [{ name: 'win.png', image: true, data: bytes.toString('base64') }] });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const page = (await request(app).get('/feed/posts?filter=photos').set('Authorization', token(client))).body as { items: { id: string; attachments: { id: string }[] }[] };
    expect(page.items[0]!.id).toBe(id);
    const path = `/feed/posts/${id}/attachments/${page.items[0]!.attachments[0]!.id}`;
    const photo = await request(app).get(path).set('Authorization', token(peer));
    expect(photo.headers['content-type']).toContain('image/jpeg');
    expect((await request(app).delete(`/feed/posts/${id}`).set('Authorization', token(client))).status).toBe(204);
    expect((await request(app).get(path).set('Authorization', token(peer))).status).toBe(404);
    expect((await pool.query('SELECT 1 FROM feed_attachments WHERE post_id=$1', [id])).rowCount).toBe(0);
  });
});
