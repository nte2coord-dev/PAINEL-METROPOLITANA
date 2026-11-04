'use strict';
const router = require('express').Router();
const { q } = require('../db');
const { verificarSenha, hashToken, obterCookie, gravarCookie, limparCookie, criarSessao } = require('../auth');
const tentativas = new Map();
function limitar(req, res, next) {
  const chave = req.ip || 'desconhecido'; const agora = Date.now();
  const atual = tentativas.get(chave) || { inicio: agora, n: 0 };
  if (agora - atual.inicio > 15 * 60 * 1000) { atual.inicio = agora; atual.n = 0; }
  if (atual.n >= 10) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  atual.n++; tentativas.set(chave, atual); next();
}
router.get('/status', (_req, res) => res.json({ habilitada: process.env.AUTH_ENABLED === 'true' }));
router.post('/login', limitar, async (req, res, next) => {
  try {
    if (process.env.AUTH_ENABLED !== 'true') return res.status(409).json({ erro: 'Autenticação desativada neste ambiente.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const { rows: [user] } = await q(`select id, senha_hash from users where lower(email) = $1 and ativo = true`, [email]);
    if (!user || !verificarSenha(senha, user.senha_hash)) return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    const token = await criarSessao(user.id);
    gravarCookie(res, token);
    await q(`insert into audit_log (user_id, acao, entidade) values ($1,'login','sessao')`, [user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/logout', async (req, res, next) => {
  try {
    const token = obterCookie(req);
    if (token) await q(`delete from sessoes where token_hash = $1`, [hashToken(token)]);
    limparCookie(res); res.json({ ok: true });
  } catch (e) { next(e); }
});
module.exports = router;
