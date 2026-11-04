'use strict';
const router=require('express').Router();
const {q}=require('../db');
const {wrap,HttpError,requireAuth,requireRole}=require('../util');
const dipe=require('../integrations/dipe');
const appsscript=require('../integrations/appsscript');
const hits=new Map();
function limitarSync(req,res,next){const now=Date.now(),key=req.ip||'ip';const h=hits.get(key)||{at:now,n:0};if(now-h.at>60000){h.at=now;h.n=0;}if(h.n>=5)return res.status(429).json({erro:'Limite de sincronizações excedido.'});h.n++;hits.set(key,h);next();}
router.use(requireAuth,requireRole('admin','superintendente'));
router.get('/saude',wrap(async(_req,res)=>{
 const fontes=['dipe','appsscript','ferias'];
 const {rows}=await q(`select distinct on(fonte) fonte,inicio_em,fim_em,lidos,criados,atualizados,rejeitados,erro from integracoes_log order by fonte,inicio_em desc`);
 res.json(fontes.map(f=>{const r=rows.find(x=>x.fonte===f);return {fonte:f,habilitada:f==='dipe'?process.env.DIPE_SYNC_ENABLED==='true':f==='appsscript'?process.env.APPS_SCRIPT_SYNC_ENABLED==='true':true,ultima_execucao:r||null,conexao:f==='ferias'?'interna':'aguardando_configuracao'};}));
}));
router.post('/:fonte/sincronizar',limitarSync,wrap(async(req,res)=>{
 const conector={dipe,appsscript}[req.params.fonte];if(!conector)throw new HttpError(404,'Fonte inválida.');
 const {rows:[log]}=await q(`insert into integracoes_log(fonte) values($1) returning id,inicio_em`,[req.params.fonte]);
 try{await conector.sync();throw new Error('Conector sem normalizador configurado.');}
 catch(e){const motivo=String(e.message).slice(0,250);await q(`update integracoes_log set fim_em=now(),erro=$1 where id=$2`,['Execução bloqueada ou falha da fonte; sem payload pessoal.',log.id]);return res.status(409).json({erro:'Sincronização não executada: o conector está inativo até a configuração autorizada.',detalhe:motivo});}
}));
module.exports=router;
