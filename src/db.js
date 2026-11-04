const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// DATE como string 'YYYY-MM-DD' (evita deslocamento de fuso) e NUMERIC como número
types.setTypeParser(1082, v => v);
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));

const useSsl = process.env.PGSSL === 'true' ||
  (process.env.DATABASE_URL && /render\.com/.test(process.env.DATABASE_URL));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/painel',
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

const q = (text, params) => pool.query(text, params);

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(`create table if not exists schema_migrations (version text primary key, aplicado_em timestamptz not null default now())`);
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rowCount } = await pool.query(`select 1 from schema_migrations where version = $1`, [file]);
    if (rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query(`insert into schema_migrations (version) values ($1)`, [file]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally { client.release(); }
  }
}

module.exports = { pool, q, migrate };
