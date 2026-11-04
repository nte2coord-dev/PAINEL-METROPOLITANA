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

  // Usuário único do sistema (sem senha): usado para registrar autoria nos lançamentos
  const { rows: [{ n }] } = await q(`select count(*)::int n from users where perfil = 'admin' and ativo`);
  if (n === 0 && process.env.AUTH_ENABLED !== 'true') {
    await q(`insert into users (nome, email, senha_hash, perfil) values ('Administrador', 'admin@painel.local', null, 'admin')
             on conflict (email) do update set perfil = 'admin', ativo = true`);
  }
  if (process.env.AUTH_ENABLED === 'true') {
    const senha = process.env.AUTH_ADMIN_PASSWORD;
    const email = (process.env.AUTH_ADMIN_EMAIL || 'admin@painel.local').trim().toLowerCase();
    if (!senha || senha.length < 12) throw new Error('AUTH_ENABLED exige AUTH_ADMIN_PASSWORD com pelo menos 12 caracteres.');
    const { hashSenha } = require('./auth');
    const hash = hashSenha(senha);
    await q(`insert into users (nome, email, senha_hash, perfil, ativo) values ($1,$2,$3,'admin',true)
             on conflict (email) do update set senha_hash=excluded.senha_hash, perfil='admin', ativo=true`,
      [process.env.AUTH_ADMIN_NAME || 'Administrador', email, hash]);
    await q(`delete from sessoes where user_id=(select id from users where lower(email)=$1)`,[email]);
  }
}

module.exports = { seed };
