import 'dotenv/config';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const connection = await pool.query(
    'SELECT current_database() "database", current_user "dbUser", now() "checkedAt"',
  );
  const tables = await pool.query(`
    SELECT table_name "table", (xpath('/row/count/text()', query_to_xml(format('SELECT count(*) AS count FROM %I', table_name), false, true, '')))[1]::text "rows"
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('\nPostgreSQL connection');
  console.table(connection.rows);
  console.log('\nPersisted application tables');
  console.table(tables.rows);
  console.log('\nRead-only inspection complete. No data was changed.');
} finally {
  await pool.end();
}
