const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const router = require('express').Router();
const { q } = require('../db');
const { wrap, HttpError, signToken, requireAuth, audit, str } = require('../util');

const DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'educacao.mg.gov.br').toLowerCase();
const emailOk = e => typeof e === 'string' && new RegExp(`^[^@\\s]+@${DOMAIN.replace(/\./g, '\\.')}$`).test(e.toLowerCase());
const senhaOk = s => typeof s === 'string' && s.length >= 8;

// Limite simples de tentativas (em memória; suficiente para 1 instância)
const tentativas = new Map();
function limitar(chave) {
  const agora = Date.now();
  const t = (tentativas.get(chave) || []).filter(x => agora - x < 15 * 60 * 1000);
  if (t.length >= 8) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  t.push(agora); tentativas.set(chave, t);
}

const cookieOpts = () => ({
  httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 3600 * 1000,
});

router.post('/login', wrap(async (req, res) => {
  const email = str(req.body.email, 200)?.toLowerCase() || '';
  limitar(`${req.ip}|${email}`);
  const { rows } = await q(`select * from users where email = $1 and ativo`, [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(String(req.body.senha || ''), u.senha_hash))) {
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  res.cookie('token', signToken(u), cookieOpts());
  req.user = u; await audit(req, 'login', 'users', u.id);
  res.json({ ok: true });
}));

router.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });

router.get('/me', requireAuth, (req, res) => res.json(req.user));

router.post('/senha', requireAuth, wrap(async (req, res) => {
  const { atual, nova } = req.body;
  if (!senhaOk(nova)) throw new HttpError(400, 'A nova senha precisa ter ao menos 8 caracteres.');
  const { rows } = await q(`select senha_hash from users where id = $1`, [req.user.id]);
  if (!(await bcrypt.compare(String(atual || ''), rows[0].senha_hash))) throw new HttpError(400, 'Senha atual incorreta.');
  await q(`update users set senha_hash = $1 where id = $2`, [await bcrypt.hash(nova, 10), req.user.id]);
  await audit(req, 'trocar_senha', 'users', req.user.id);
  res.json({ ok: true });
}));

// Recuperação de senha. Sem SMTP configurado, o link vai para o log do servidor
// (o administrador pode repassá-lo). Resposta é sempre a mesma (não revela e-mails).
router.post('/esqueci', wrap(async (req, res) => {
  const email = str(req.body.email, 200)?.toLowerCase() || '';
  limitar(`forgot|${req.ip}`);
  const { rows } = await q(`select id from users where email = $1 and ativo`, [email]);
  if (rows[0]) {
    const token = crypto.randomBytes(24).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await q(`update users set reset_token_hash = $1, reset_expires = now() + interval '1 hour' where id = $2`, [hash, rows[0].id]);
    const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
    console.log(`[recuperação de senha] ${email}: ${base}/#/redefinir/${token}`);
  }
  res.json({ ok: true, mensagem: 'Se o e-mail estiver cadastrado, o link de redefinição foi gerado.' });
}));

router.post('/redefinir', wrap(async (req, res) => {
  const { token, nova } = req.body;
  if (!senhaOk(nova)) throw new HttpError(400, 'A nova senha precisa ter ao menos 8 caracteres.');
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const { rows } = await q(
    `update users set senha_hash = $1, reset_token_hash = null, reset_expires = null
      where reset_token_hash = $2 and reset_expires > now() returning id`,
    [await bcrypt.hash(nova, 10), hash]);
  if (!rows[0]) throw new HttpError(400, 'Link inválido ou expirado.');
  res.json({ ok: true });
}));

module.exports = router;
module.exports.emailOk = emailOk;
module.exports.senhaOk = senhaOk;
