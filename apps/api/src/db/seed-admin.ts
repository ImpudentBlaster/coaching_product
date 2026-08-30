import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL; const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(); const password = process.env.ADMIN_PASSWORD;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!email || !email.includes('@')) throw new Error('A valid ADMIN_EMAIL is required');
if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
const pool = new pg.Pool({ connectionString: databaseUrl }); const client = await pool.connect();
try {
  await client.query('BEGIN');
  const existing = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount === 0) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await client.query("INSERT INTO users(email, password_hash, role, account_status) VALUES ($1, $2, 'PLATFORM_ADMIN', 'APPROVED')", [email, passwordHash]);
    console.info('Platform admin created');
  } else { console.info('Platform admin already exists'); }
  await client.query('COMMIT');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
