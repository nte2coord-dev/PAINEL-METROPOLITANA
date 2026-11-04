'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {dataUtc,diasCorridos,diasUteis,saldo,validarNovoPeriodo,validarAfastamento}=require('../src/ferias/regras');

test('datas ISO são validadas por calendário e sem depender do fuso local',()=>{
 assert.equal(dataUtc('2024-02-29')!==null,true);assert.equal(dataUtc('2025-02-29'),null);assert.equal(dataUtc('2025-13-01'),null);
 assert.equal(diasCorridos('2024-02-28','2024-03-01'),3);
});
test('períodos incluem início e fim no cálculo de dias corridos',()=>assert.equal(diasCorridos('2026-01-01','2026-01-10'),10));
test('saldo de férias é 60 menos dias lançados',()=>{
 const s=saldo([{data_inicio:'2026-01-01',data_fim:'2026-01-10'},{data_inicio:'2026-07-01',data_fim:'2026-07-20'}]);
 assert.deepEqual(s,{gozados:30,saldo:30,quantidade:2});
});
test('rejeita fim antes do início, sobreposição, sétimo período e excesso de saldo',()=>{
 assert.throws(()=>diasCorridos('2026-02-02','2026-02-01'),/anterior/);
 const p=[{id:1,data_inicio:'2026-01-01',data_fim:'2026-01-10'}];
 assert.throws(()=>validarNovoPeriodo(p,'2026-01-10','2026-01-12'),/sobrepõe/);
 const seis=Array.from({length:6},(_,i)=>({id:i+1,data_inicio:`2026-${String(i+1).padStart(2,'0')}-01`,data_fim:`2026-${String(i+1).padStart(2,'0')}-01`}));
 assert.throws(()=>validarNovoPeriodo(seis,'2026-07-01','2026-07-01'),/limite/);
 const cinquenta=[{id:1,data_inicio:'2026-01-01',data_fim:'2026-02-19'}];
 assert.throws(()=>validarNovoPeriodo(cinquenta,'2026-03-01','2026-03-11'),/saldo/);
});
test('dias úteis excluem fins de semana e feriados informados',()=>{
 assert.equal(diasUteis('2026-10-26','2026-10-30'),5);
 assert.equal(diasUteis('2026-10-26','2026-10-30',['2026-10-28']),4);
 assert.equal(validarAfastamento('2026-10-24','2026-10-26'),1);
});
