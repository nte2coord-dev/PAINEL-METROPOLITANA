const bcrypt = require('bcryptjs');
const router = require('express').Router();
const { q } = require('../db');
const {
  wrap, HttpError, requireAuth, requireRole, sectorScope, canSeeSector, audit, refreshConfig, str,
} = require('../util');
const { emailOk, senhaOk } = require('./auth');
const { MODELOS_INDICADOR } = require('../org');

router.use(requireAuth);

const lista = v => (Array.isArray(v) ? v : String(v || '').split(/[,;\/\n]/))
  .map(x => String(x).trim()).filter(Boolean).slice(0, 20);

// ---------- Estrutura (leitura para todos) ----------
router.get('/unidades', wrap(async (req, res) => {
  const sc = sectorScope(req.user, 's', 1);
  res.json((await q(
    `select u.* from units u where exists (select 1 from sectors s where s.unit_id = u.id and ${sc.sql}) order by u.ordem`,
    sc.params)).rows);
}));

router.get('/setores', wrap(async (req, res) => {
  const sc = sectorScope(req.user, 's', 1);
  res.json((await q(
    `select s.*, u.sigla as unidade from sectors s join units u on u.id = s.unit_id
      where s.ativo and ${sc.sql} order by u.ordem, s.nome`, sc.params)).rows);
}));

router.get('/tipos-demanda', wrap(async (_req, res) => {
  res.json((await q(`select * from tipos_demanda where ativo order by nome`)).rows);
}));

router.get('/modelos-indicador', (_req, res) => res.json(MODELOS_INDICADOR));

// ---------- Contatos ----------
router.get('/contatos', wrap(async (req, res) => {
  const params = []; let w = 's.ativo';
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    w += ` and (s.nome ilike $1 or u.sigla ilike $1 or s.sala ilike $1 or array_to_string(s.emails,' ') ilike $1
                or array_to_string(s.ramais,' ') ilike $1)`;
  }
  res.json((await q(
    `select s.*, u.sigla as unidade from sectors s join units u on u.id = s.unit_id
      where ${w} order by u.ordem, s.nome`, params)).rows);
}));

router.put('/setores/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [antes] } = await q(`select * from sectors where id = $1`, [id]);
  if (!antes) throw new HttpError(404, 'Setor não encontrado.');
  const ehAdmin = req.user.perfil === 'admin';
  const ehCoordDoSetor = req.user.perfil === 'coord_setor' && req.user.sector_id === id;
  if (!ehAdmin && !ehCoordDoSetor) throw new HttpError(403, 'Sem permissão.');
  const b = req.body;
  const emails = lista(b.emails).map(e => e.toLowerCase());
  if (emails.some(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) throw new HttpError(400, 'Há e-mail inválido na lista.');
  const nome = ehAdmin ? (str(b.nome, 150) || antes.nome) : antes.nome;
  const { rows } = await q(
    `update sectors set nome=$1, ramais=$2, telefones=$3, sala=$4, emails=$5 where id=$6 returning *`,
    [nome, lista(b.ramais), lista(b.telefones), str(b.sala, 60), emails, id]);
  await audit(req, 'editar', 'sectors', id, antes, rows[0]);
  res.json(rows[0]);
}));

router.post('/setores', requireRole('admin'), wrap(async (req, res) => {
  const nome = str(req.body.nome, 150); const unitId = Number(req.body.unit_id);
  if (!nome || !unitId) throw new HttpError(400, 'Informe a unidade e o nome do setor.');
  const { rows } = await q(
    `insert into sectors (unit_id, nome, ramais, telefones, sala, emails) values ($1,$2,$3,$4,$5,$6)
     on conflict (unit_id, nome) do update set ativo = true returning *`,
    [unitId, nome, lista(req.body.ramais), lista(req.body.telefones), str(req.body.sala, 60), lista(req.body.emails)]);
  await audit(req, 'criar', 'sectors', rows[0].id, null, rows[0]);
  res.status(201).json(rows[0]);
}));

router.delete('/setores/:id', requireRole('admin'), wrap(async (req, res) => {
  // Desativa em vez de apagar: preserva o histórico de demandas
  const { rows } = await q(`update sectors set ativo = false where id = $1 returning *`, [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Setor não encontrado.');
  await audit(req, 'excluir', 'sectors', rows[0].id, rows[0], null);
  res.json({ ok: true });
}));

// ---------- Usuários (admin; superintendente só lê) ----------
router.get('/usuarios', requireRole('admin', 'superintendente'), wrap(async (_req, res) => {
  res.json((await q(
    `select u.id, u.nome, u.email, u.perfil, u.ativo, u.unit_id, u.sector_id, un.sigla as unidade, s.nome as setor
       from users u left join units un on un.id = u.unit_id left join sectors s on s.id = u.sector_id
      order by u.nome`)).rows);
}));

async function validarUsuario(b, criando) {
  const nome = str(b.nome, 150); const email = str(b.email, 200)?.toLowerCase();
  if (!nome) throw new HttpError(400, 'Informe o nome.');
  if (!emailOk(email)) throw new HttpError(400, 'Use o e-mail institucional (@educacao.mg.gov.br).');
  if (!['superintendente', 'admin', 'diretor', 'coord_setor'].includes(b.perfil)) throw new HttpError(400, 'Perfil inválido.');
  let unit_id = b.unit_id ? Number(b.unit_id) : null; let sector_id = b.sector_id ? Number(b.sector_id) : null;
  if (b.perfil === 'coord_setor') {
    if (!sector_id) throw new HttpError(400, 'Coordenador de setor precisa de um setor.');
    unit_id = (await q(`select unit_id from sectors where id = $1`, [sector_id])).rows[0]?.unit_id;
    if (!unit_id) throw new HttpError(400, 'Setor inválido.');
  } else if (b.perfil === 'diretor') {
    if (!unit_id) throw new HttpError(400, 'Diretor precisa de uma unidade.');
    sector_id = null;
  } else { unit_id = null; sector_id = null; }
  if (criando && !senhaOk(b.senha)) throw new HttpError(400, 'A senha precisa ter ao menos 8 caracteres.');
  return { nome, email, perfil: b.perfil, unit_id, sector_id };
}

router.post('/usuarios', requireRole('admin'), wrap(async (req, res) => {
  const u = await validarUsuario(req.body, true);
  try {
    const { rows } = await q(
      `insert into users (nome, email, senha_hash, perfil, unit_id, sector_id) values ($1,$2,$3,$4,$5,$6)
       returning id, nome, email, perfil, unit_id, sector_id, ativo`,
      [u.nome, u.email, await bcrypt.hash(req.body.senha, 10), u.perfil, u.unit_id, u.sector_id]);
    await audit(req, 'criar', 'users', rows[0].id, null, rows[0]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Já existe usuário com este e-mail.');
    throw e;
  }
}));

router.put('/usuarios/:id', requireRole('admin'), wrap(async (req, res) => {
  const { rows: [antes] } = await q(
    `select id, nome, email, perfil, unit_id, sector_id, ativo from users where id = $1`, [req.params.id]);
  if (!antes) throw new HttpError(404, 'Usuário não encontrado.');
  const u = await validarUsuario(req.body, false);
  const ativo = req.body.ativo !== false;
  if (antes.id === req.user.id && (!ativo || u.perfil !== 'admin')) {
    throw new HttpError(400, 'Você não pode desativar ou rebaixar o seu próprio acesso.');
  }
  if (req.body.senha) {
    if (!senhaOk(req.body.senha)) throw new HttpError(400, 'A senha precisa ter ao menos 8 caracteres.');
    await q(`update users set senha_hash = $1 where id = $2`, [await bcrypt.hash(req.body.senha, 10), antes.id]);
  }
  const { rows } = await q(
    `update users set nome=$1, email=$2, perfil=$3, unit_id=$4, sector_id=$5, ativo=$6 where id=$7
     returning id, nome, email, perfil, unit_id, sector_id, ativo`,
    [u.nome, u.email, u.perfil, u.unit_id, u.sector_id, ativo, antes.id]);
  await audit(req, 'editar', 'users', antes.id, antes, rows[0]);
  res.json(rows[0]);
}));

// ---------- Configuração e tipos de demanda ----------
router.get('/config', requireRole('admin', 'superintendente'), wrap(async (_req, res) => {
  res.json(Object.fromEntries((await q(`select * from config`)).rows.map(r => [r.chave, r.valor])));
}));

router.put('/config', requireRole('admin'), wrap(async (req, res) => {
  const dias = parseInt(req.body.dias_vence_em_breve, 10);
  if (!(dias >= 0 && dias <= 60)) throw new HttpError(400, 'Dias para "vence em breve" deve estar entre 0 e 60.');
  await q(`insert into config (chave, valor) values ('dias_vence_em_breve', $1)
           on conflict (chave) do update set valor = excluded.valor`, [String(dias)]);
  if (['mensal', 'quinzenal'].includes(req.body.periodicidade_consolidado)) {
    await q(`insert into config (chave, valor) values ('periodicidade_consolidado', $1)
             on conflict (chave) do update set valor = excluded.valor`, [req.body.periodicidade_consolidado]);
  }
  await refreshConfig();
  await audit(req, 'editar', 'config', null, null, req.body);
  res.json({ ok: true });
}));

router.post('/tipos-demanda', requireRole('admin'), wrap(async (req, res) => {
  const nome = str(req.body.nome, 100);
  if (!nome) throw new HttpError(400, 'Informe o nome.');
  const { rows } = await q(`insert into tipos_demanda (nome) values ($1)
    on conflict (nome) do update set ativo = true returning *`, [nome]);
  await audit(req, 'criar', 'tipos_demanda', rows[0].id, null, rows[0]);
  res.status(201).json(rows[0]);
}));

// ---------- Auditoria ----------
router.get('/auditoria', requireRole('admin', 'superintendente'), wrap(async (req, res) => {
  const params = []; let w = 'true';
  if (req.query.entidade) { params.push(req.query.entidade); w += ` and entidade = $${params.length}`; }
  if (req.query.entidade_id) { params.push(Number(req.query.entidade_id)); w += ` and entidade_id = $${params.length}`; }
  res.json((await q(`select * from audit_log where ${w} order by id desc limit 300`, params)).rows);
}));

// ---------- Alertas ----------
router.get('/alertas', wrap(async (req, res) => {
  const u = req.user; const params = [];
  let w = 'true';
  if (u.perfil === 'coord_setor') {
    params.push(u.sector_id, u.unit_id);
    w = `(a.sector_id = $1 or (a.sector_id is null and a.unit_id = $2) or (a.sector_id is null and a.unit_id is null))`;
  } else if (u.perfil === 'diretor') {
    params.push(u.unit_id, u.id);
    w = `(a.unit_id = $1 or a.de_user_id = $2)`;
  }
  res.json((await q(
    `select a.*, usr.nome as de, un.sigla as unidade, s.nome as setor, d.processo, d.assunto
       from alertas a join users usr on usr.id = a.de_user_id
       left join units un on un.id = a.unit_id left join sectors s on s.id = a.sector_id
       left join demandas d on d.id = a.demanda_id
      where ${w} order by a.created_at desc limit 100`, params)).rows);
}));

router.post('/alertas', requireRole('admin', 'superintendente', 'diretor'), wrap(async (req, res) => {
  const mensagem = str(req.body.mensagem, 1000);
  if (!mensagem) throw new HttpError(400, 'Escreva a mensagem do alerta.');
  let unitId = req.body.unit_id ? Number(req.body.unit_id) : null;
  let sectorId = req.body.sector_id ? Number(req.body.sector_id) : null;
  const demandaId = req.body.demanda_id ? Number(req.body.demanda_id) : null;
  if (demandaId) {
    // Alerta de demanda: o destino é sempre o setor responsável (não vem do cliente)
    const { rows: [d] } = await q(`select sector_id, status from demandas where id = $1`, [demandaId]);
    if (!d || !(await canSeeSector(req.user, d.sector_id))) throw new HttpError(404, 'Demanda não encontrada.');
    sectorId = d.sector_id;
  } else if (req.user.perfil === 'diretor') {
    unitId = req.user.unit_id;
    if (sectorId && !(await canSeeSector(req.user, sectorId))) throw new HttpError(403, 'Setor fora da sua unidade.');
  }
  if (sectorId) unitId = (await q(`select unit_id from sectors where id = $1`, [sectorId])).rows[0]?.unit_id ?? unitId;
  const { rows } = await q(
    `insert into alertas (de_user_id, unit_id, sector_id, demanda_id, mensagem) values ($1,$2,$3,$4,$5) returning *`,
    [req.user.id, unitId, sectorId, demandaId, mensagem]);
  await audit(req, 'criar', 'alertas', rows[0].id, null, rows[0]);
  res.status(201).json(rows[0]);
}));

// Alertas de uma demanda específica (quem enxerga a demanda enxerga seus alertas)
router.get('/demandas/:id/alertas', wrap(async (req, res) => {
  const { rows: [d] } = await q(`select sector_id from demandas where id = $1`, [req.params.id]);
  if (!d || !(await canSeeSector(req.user, d.sector_id))) throw new HttpError(404, 'Demanda não encontrada.');
  res.json((await q(
    `select a.id, a.mensagem, a.created_at, a.lido_em, usr.nome as de from alertas a join users usr on usr.id = a.de_user_id
      where a.demanda_id = $1 order by a.created_at desc`, [req.params.id])).rows);
}));

router.post('/alertas/:id/lido', wrap(async (req, res) => {
  await q(`update alertas set lido_em = now() where id = $1 and lido_em is null`, [req.params.id]);
  res.json({ ok: true });
}));

// ---------- Busca global ----------
router.get('/busca', wrap(async (req, res) => {
  const termo = str(req.query.q, 100);
  if (!termo || termo.length < 2) return res.json({ setores: [], demandas: [] });
  const sc = sectorScope(req.user, 's', 2);
  const p = [`%${termo}%`, ...sc.params];
  const setores = (await q(
    `select s.id, s.nome, u.sigla as unidade from sectors s join units u on u.id = s.unit_id
      where s.ativo and s.nome ilike $1 and ${sc.sql} limit 8`, p)).rows;
  const demandas = (await q(
    `select d.id, d.processo, d.assunto, s.nome as setor, s.id as sector_id from demandas d
       join sectors s on s.id = d.sector_id
      where (d.processo ilike $1 or d.assunto ilike $1 or d.responsavel ilike $1) and ${sc.sql}
      order by d.id desc limit 10`, p)).rows;
  res.json({ setores, demandas });
}));

module.exports = router;
