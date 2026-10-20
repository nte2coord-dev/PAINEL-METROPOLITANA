const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q } = require('./db');
const { UNITS, TIPOS_DEMANDA, CONFIG_DEFAULTS } = require('./org');

async function seed() {
  for (const [i, u] of UNITS.entries()) {
    const { rows } = await q(
      `insert into units (sigla, nome, ordem) values ($1,$2,$3)
       on conflict (sigla) do update set nome = excluded.nome returning id`,
      [u.sigla, u.nome, i]);
    for (const s of u.setores) {
      await q(`insert into sectors (unit_id, nome) values ($1,$2) on conflict do nothing`, [rows[0].id, s]);
    }
  }
  for (const t of TIPOS_DEMANDA) await q(`insert into tipos_demanda (nome) values ($1) on conflict do nothing`, [t]);
  for (const [k, v] of Object.entries(CONFIG_DEFAULTS)) {
    await q(`insert into config (chave, valor) values ($1,$2) on conflict do nothing`, [k, v]);
  }

  const { rows: [{ n }] } = await q(`select count(*)::int n from users`);
  if (n === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@educacao.mg.gov.br').toLowerCase();
    let senha = process.env.ADMIN_PASSWORD;
    const gerada = !senha;
    if (gerada) senha = crypto.randomBytes(9).toString('base64url');
    await q(`insert into users (nome, email, senha_hash, perfil) values ($1,$2,$3,'admin')`,
      ['Administrador', email, await bcrypt.hash(senha, 10)]);
    console.log(`[bootstrap] Administrador criado: ${email}` + (gerada ? ` | senha temporária: ${senha}` : ''));
  }
}

module.exports = { seed };
