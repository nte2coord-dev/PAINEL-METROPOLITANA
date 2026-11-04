'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {upsertExterno}=require('../src/integrations/upsert');
const {importarLote}=require('../src/integrations/staging');

test('upsert idempotente e staging isolado por item', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});const c=await pool.connect();
 try{
  await c.query('begin');
  const primeira=await upsertExterno(c,'escolas',{nome:'Fixture Integration Test',fonte:'teste_unitario',id_externo:'fixture-1',ativo:true});
  const segunda=await upsertExterno(c,'escolas',{nome:'Fixture Integration Test Atualizado',fonte:'teste_unitario',id_externo:'fixture-1',ativo:true});
  assert.equal(primeira.criado,true);assert.equal(segunda.criado,false);
  const {rows}=await c.query(`select count(*)::int n,nome from escolas where fonte='teste_unitario' and id_externo='fixture-1' group by nome`);
  assert.equal(rows.length,1);assert.equal(rows[0].nome,'Fixture Integration Test Atualizado');
  const result=await importarLote({client:c,fonte:'dipe',registros:[{codigo:'ok'},{codigo:'ruim'}],extrairId:x=>x.codigo,normalizar:x=>{if(x.codigo==='ruim')throw new Error('campo necessário ausente');return {nome:'Synthetic staging row'};},gravar:async()=>({criado:true})});
  assert.deepEqual(result,{lidos:2,criados:1,atualizados:0,rejeitados:1});
  const pend=(await c.query(`select count(*)::int n from pendencias_importacao where fonte='dipe' and motivo='campo necessário ausente'`)).rows[0].n;
  assert.equal(pend,1);
  await c.query('rollback');
 }finally{c.release();await pool.end();}
});
