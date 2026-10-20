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
}

module.exports = { pool, q, migrate };
