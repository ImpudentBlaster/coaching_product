import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
    throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: databaseUrl });
const migrationsDirectory = resolve(process.cwd(), 'db/migrations');
try {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const appliedResult = await pool.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map((row) => row.name));
    const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
        if (applied.has(file))
            continue;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(await readFile(resolve(migrationsDirectory, file), 'utf8'));
            await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.info(`Applied ${file}`);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    console.info('Database migrations are current');
}
finally {
    await pool.end();
}
//# sourceMappingURL=migrate.js.map