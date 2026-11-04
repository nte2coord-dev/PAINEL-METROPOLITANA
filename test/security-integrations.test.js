'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {hashSenha,verificarSenha,hashToken}=require('../src/auth');
const dipe=require('../src/integrations/dipe');
const appsscript=require('../src/integrations/appsscript');

test('senha usa hash scrypt com sal e valida comparação',()=>{
 const h=hashSenha('senha-segura-de-teste');assert.match(h,/^scrypt\$/);assert.equal(verificarSenha('senha-segura-de-teste',h),true);assert.equal(verificarSenha('senha-errada',h),false);assert.notEqual(hashSenha('senha-segura-de-teste'),h);
});
test('tokens são persistidos por hash, não pelo valor em claro',()=>assert.notEqual(hashToken('token-teste'), 'token-teste'));
test('conectores DIPE e Apps Script recusam execução quando desativados',async()=>{
 await assert.rejects(dipe.fetch(),/desativado/);await assert.rejects(appsscript.fetch(),/desativado/);
 await assert.rejects(dipe.sync(),/desativada/);await assert.rejects(appsscript.sync(),/desativada/);
});
test('normalizadores ficam deliberadamente sem mapeamento até existirem fixtures reais',()=>{
 assert.throws(()=>dipe.normalize({}),/contrato autorizado/);assert.throws(()=>appsscript.normalize({}),/amostras autorizadas/);
});
