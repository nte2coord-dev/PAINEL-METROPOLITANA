const jwt = require('jsonwebtoken');
const { q } = require('./db');

const SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET é obrigatório em produção');
  return 'dev-secret-nao-usar-em-producao';
})();

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function signToken(user) {
  return jwt.sign({ uid: user.id }, SECRET, { expiresIn: '12h' });
}

async function loadUser(req, _res, next) {
  try {
    const token = req.cookies && req.cookies.token;
    if (token) {
      const { uid } = jwt.verify(token, SECRET);
      const { rows } = await q(
        `select u.id, u.nome, u.email, u.perfil, u.unit_id, u.sector_id, u.ativo,
                un.sigla as unit_sigla, s.nome as sector_nome
           from users u left join units un on un.id = u.unit_id
           left join sectors s on s.id = u.sector_id where u.id = $1`, [uid]);
      if (rows[0] && rows[0].ativo) req.user = rows[0];
    }
  } catch (_) { /* token inválido/expirado: segue anônimo */ }
  next();
}

const requireAuth = (req, _res, next) =>
  req.user ? next() : next(new HttpError(401, 'Faça login para continuar.'));

const requireRole = (...perfis) => (req, _res, next) =>
  req.user && perfis.includes(req.user.perfil) ? next() : next(new HttpError(403, 'Sem permissão para esta ação.'));

// Setores que o usuário enxerga -> fragmento SQL sobre sectors (alias dado)
function sectorScope(user, alias = 's', startIdx = 1) {
  switch (user.perfil) {
    case 'admin':
    case 'superintendente': return { sql: 'true', params: [] };
    case 'diretor': return { sql: `${alias}.unit_id = $${startIdx}`, params: [user.unit_id] };
    default: return { sql: `${alias}.id = $${startIdx}`, params: [user.sector_id] };
  }
}

async function canSeeSector(user, sectorId) {
  const sc = sectorScope(user, 's', 2);
  const { rowCount } = await q(`select 1 from sectors s where s.id = $1 and ${sc.sql}`, [sectorId, ...sc.params]);
  return rowCount > 0;
}

// Quem lança/edita dados: coordenador do próprio setor (admin pode, p/ suporte)
const canWrite = (user, sectorId) =>
  user.perfil === 'admin' || (user.perfil === 'coord_setor' && user.sector_id === Number(sectorId));

async function audit(req, acao, entidade, entidadeId, antes, depois) {
  await q(
    `insert into audit_log (user_id, user_email, acao, entidade, entidade_id, antes, depois)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [req.user ? req.user.id : null, req.user ? req.user.email : null, acao, entidade, entidadeId,
      antes ? JSON.stringify(antes) : null, depois ? JSON.stringify(depois) : null]);
}

// Cache do parâmetro "dias para vencer"
let diasBreve = 3;
async function refreshConfig() {
  const { rows } = await q(`select valor from config where chave = 'dias_vence_em_breve'`);
  if (rows[0]) diasBreve = Math.max(0, parseInt(rows[0].valor, 10) || 3);
}
const getDiasBreve = () => diasBreve;

// Status de prazo calculado pelo sistema (nunca digitado)
function prazoStatusSql(alias = 'd') {
  const d = getDiasBreve();
  return `(case
    when ${alias}.status = 'concluida' then 'concluida'
    when ${alias}.status = 'cancelada' then 'cancelada'
    when ${alias}.prazo < current_date then 'fora'
    when ${alias}.prazo - current_date <= ${d} then 'breve'
    else 'no_prazo' end)`;
}

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const str = (v, max = 500) => (v == null ? null : String(v).trim().slice(0, max) || null);

module.exports = {
  wrap, HttpError, signToken, loadUser, requireAuth, requireRole, sectorScope, canSeeSector,
  canWrite, audit, refreshConfig, getDiasBreve, prazoStatusSql, isDate, str,
};
