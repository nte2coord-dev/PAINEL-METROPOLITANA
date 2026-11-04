'use strict';
const crypto = require('crypto');
const { q } = require('./db');
const COOKIE = 'painel_sessao';
const DURACAO_MS = 8 * 60 * 60 * 1000;

function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verificarSenha(senha, formato) {
  if (!formato || typeof formato !== 'string') return false;
  const [alg, salt, esperado] = formato.split('$');
  if (alg !== 'scrypt' || !salt || !esperado) return false;
  const obtido = crypto.scryptSync(String(senha), salt, 64);
  const esperadoBuf = Buffer.from(esperado, 'hex');
  return obtido.length === esperadoBuf.length && crypto.timingSafeEqual(obtido, esperadoBuf);
}
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');
function obterCookie(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)painel_sessao=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function gravarCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(DURACAO_MS / 1000)}${secure}`);
}
function limparCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
async function criarSessao(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + DURACAO_MS);
  await q(`delete from sessoes where expira_em < now()`);
  await q(`insert into sessoes (user_id, token_hash, expira_em) values ($1,$2,$3)`, [userId, hashToken(token), expira]);
  return token;
}
module.exports = { COOKIE, DURACAO_MS, hashSenha, verificarSenha, hashToken, obterCookie, gravarCookie, limparCookie, criarSessao };
