'use strict';
const crypto = require('crypto');
const router = require('express').Router();
const { q, pool } = require('../db');
const { wrap, HttpError, requireAuth, requireRole, canSeeSector } = require('../util');
const { DIREITO_DIAS, saldo, diasCorridos, validarNovoPeriodo, validarAfastamento } = require('../ferias/regras');
const publicRouter = require('express').Router();

router.use(requireAuth);
const admin = (...roles) => requireRole(...roles);
const isManager = u => ['admin', 'superintendente'].includes(u.perfil);
const text = (v, max = 200) => v == null ? null : String(v).trim().slice(0, max) || null;
const idNum = x => Number.isSafeInteger(Number(x)) && Number(x) > 0;
const jsonCanonico = x => Array.isArray(x) ? `[${x.map(jsonCanonico).join(',')}]` : x && typeof x === 'object' ? `{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${jsonCanonico(x[k])}`).join(',')}}` : JSON.stringify(x);
async function diretorPermitido(user, id) {
  if (isManager(user)) return true;
  if (user.diretor_id && Number(user.diretor_id) === Number(id)) return true;
  if (user.perfil === 'diretor') {
    const { rows: [r] } = await q(`select 1 from diretores d join escolas e on e.id=d.escola_id where d.id=$1 and e.unidade_id=$2`, [id,user.unit_id]);
    return !!r;
  }
  return false;
}
async function auditFerias(req, acao, entidade, entidadeId) {
  await q(`insert into audit_log (user_id, acao, entidade, entidade_id) values ($1,$2,$3,$4)`, [req.user.id, acao, entidade, entidadeId]);
}
async function obterPeriodos(diretorId, client = q) {
  return (await client(`select id, diretor_id, lote_id, data_inicio, data_fim, link_drive, observacao, criado_em, atualizado_em from ferias_periodos where diretor_id=$1 order by data_inicio,id`, [diretorId])).rows;
}
async function saldoDiretor(diretorId, client = q) {
  const periodos = await obterPeriodos(diretorId, client);
  return { periodos, ...saldo(periodos) };
}
function dataValida(v) { return typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v; }

router.get('/escolas', wrap(async (req,res) => {
  const { rows } = await q(`select id,nome,municipio,unidade_id from escolas where ativo order by nome`);
  res.json(rows);
}));
router.post('/escolas', admin('admin','superintendente'), wrap(async (req,res) => {
  const nome=text(req.body.nome); const municipio=text(req.body.municipio); const unidadeId=req.body.unidade_id ? Number(req.body.unidade_id) : null;
  if(!nome) throw new HttpError(400,'Informe o nome da escola.');
  if(unidadeId && !(await q(`select 1 from units where id=$1`,[unidadeId])).rowCount) throw new HttpError(400,'Unidade inválida.');
  const {rows:[r]}=await q(`insert into escolas(nome,municipio,unidade_id) values($1,$2,$3) returning id,nome,municipio,unidade_id`,[nome,municipio,unidadeId]);
  await auditFerias(req,'criar','escolas',r.id); res.status(201).json(r);
}));

router.get('/diretores', wrap(async (req,res) => {
  let where='d.ativo'; const params=[];
  if(!isManager(req.user)) {
    if(req.user.diretor_id) { params.push(req.user.diretor_id); where += ` and d.id=$${params.length}`; }
    else if(req.user.perfil==='diretor') { params.push(req.user.unit_id); where += ` and e.unidade_id=$${params.length}`; }
    else throw new HttpError(403,'Sem permissão para consultar diretores.');
  }
  const {rows}=await q(`select d.id,d.nome,d.escola_id,e.nome as escola,e.municipio,e.unidade_id,u.sigla as unidade
      from diretores d join escolas e on e.id=d.escola_id left join units u on u.id=e.unidade_id where ${where} order by d.nome`,params);
  const list=[];
  for(const d of rows) { const s=await saldoDiretor(d.id); list.push({...d,gozados:s.gozados,saldo:s.saldo,quantidade_periodos:s.quantidade}); }
  res.json(list);
}));
router.post('/diretores', admin('admin','superintendente'), wrap(async (req,res)=>{
  const nome=text(req.body.nome); const escola=Number(req.body.escola_id); const email=text(req.body.email,254);
  if(!nome || !idNum(escola)) throw new HttpError(400,'Informe o nome do diretor e a escola.');
  if(!(await q(`select 1 from escolas where id=$1 and ativo`,[escola])).rowCount) throw new HttpError(400,'Escola inválida.');
  const {rows:[r]}=await q(`insert into diretores(nome,email,escola_id) values($1,$2,$3) returning id,nome,email,escola_id`,[nome,email,escola]);
  await auditFerias(req,'criar','diretores',r.id); res.status(201).json(r);
}));
router.put('/diretores/:id', admin('admin','superintendente'), wrap(async(req,res)=>{
  const id=Number(req.params.id), nome=text(req.body.nome), escola=Number(req.body.escola_id), email=text(req.body.email,254);
  if(!idNum(id)||!nome||!idNum(escola)) throw new HttpError(400,'Dados inválidos.');
  const {rows:[r]}=await q(`update diretores set nome=$1,email=$2,escola_id=$3,atualizado_em=now() where id=$4 and ativo returning id,nome,email,escola_id`,[nome,email,escola,id]);
  if(!r) throw new HttpError(404,'Diretor não encontrado.'); await auditFerias(req,'editar','diretores',id); res.json(r);
}));

router.get('/periodos', wrap(async(req,res)=>{
  const did=Number(req.query.diretor_id);
  if(!idNum(did)||!(await diretorPermitido(req.user,did))) throw new HttpError(403,'Sem permissão para consultar este diretor.');
  const s=await saldoDiretor(did); res.json({...s,direito:DIREITO_DIAS});
}));
router.post('/periodos', wrap(async(req,res)=>{
  const did=Number(req.body.diretor_id);
  if(!idNum(did)||!(await diretorPermitido(req.user,did))) throw new HttpError(403,'Sem permissão para lançar férias para este diretor.');
  const inicio=req.body.data_inicio, fim=req.body.data_fim;
  if(!dataValida(inicio)||!dataValida(fim)) throw new HttpError(400,'Informe datas válidas no formato AAAA-MM-DD.');
  const client=await pool.connect();
  try {
    await client.query('begin');
    const {rowCount: existe}=await client.query(`select id from diretores where id=$1 and ativo for update`,[did]);
    if(!existe) throw new HttpError(404,'Diretor não encontrado.');
    const periodos=await obterPeriodos(did,(sql,p)=>client.query(sql,p));
    validarNovoPeriodo(periodos,inicio,fim);
    const {rows:[r]}=await client.query(`insert into ferias_periodos(diretor_id,data_inicio,data_fim,link_drive,observacao,criado_por) values($1,$2,$3,$4,$5,$6) returning id,diretor_id,data_inicio,data_fim,link_drive,observacao`,[did,inicio,fim,text(req.body.link_drive,1000),text(req.body.observacao,2000),req.user.id]);
    await client.query('commit'); await auditFerias(req,'criar','ferias_periodos',r.id); res.status(201).json(r);
  } catch(e) { await client.query('rollback'); if(e instanceof HttpError) throw e; if(e.message.includes('período')||e.message.includes('limite')||e.message.includes('saldo')) throw new HttpError(400,e.message); throw e; }
  finally { client.release(); }
}));
router.put('/periodos/:id', wrap(async(req,res)=>{
  const id=Number(req.params.id); const {rows:[before]}=await q(`select * from ferias_periodos where id=$1`,[id]);
  if(!before||!(await diretorPermitido(req.user,before.diretor_id))||!isManager(req.user)) throw new HttpError(403,'Sem permissão para editar este período.');
  const inicio=req.body.data_inicio, fim=req.body.data_fim;
  if(!dataValida(inicio)||!dataValida(fim)) throw new HttpError(400,'Informe datas válidas.');
  const others=(await obterPeriodos(before.diretor_id)).filter(p=>Number(p.id)!==id);
  try { validarNovoPeriodo(others,inicio,fim); } catch(e) { throw new HttpError(400,e.message); }
  const {rows:[r]}=await q(`update ferias_periodos set data_inicio=$1,data_fim=$2,link_drive=$3,observacao=$4,atualizado_em=now() where id=$5 returning id,diretor_id,data_inicio,data_fim,link_drive,observacao`,[inicio,fim,text(req.body.link_drive,1000),text(req.body.observacao,2000),id]);
  await auditFerias(req,'editar','ferias_periodos',id); res.json(r);
}));
router.delete('/periodos/:id', wrap(async(req,res)=>{
  const id=Number(req.params.id); const {rows:[p]}=await q(`select id,diretor_id from ferias_periodos where id=$1`,[id]);
  if(!p||!isManager(req.user)) throw new HttpError(403,'Sem permissão para remover este período.');
  await q(`delete from ferias_periodos where id=$1`,[id]); await auditFerias(req,'excluir','ferias_periodos',id); res.json({ok:true});
}));

router.post('/lotes', admin('admin','superintendente'), wrap(async(req,res)=>{
  const inicio=req.body.data_inicio,fim=req.body.data_fim,nome=text(req.body.nome,150)||'Aplicação de férias em lote';
  if(!dataValida(inicio)||!dataValida(fim)) throw new HttpError(400,'Informe datas válidas.');
  try { diasCorridos(inicio,fim); } catch(e) { throw new HttpError(400,e.message); }
  const client=await pool.connect();
  try {
    await client.query('begin');
    const {rows:[lote]}=await client.query(`insert into ferias_lotes(nome,observacao,criado_por) values($1,$2,$3) returning id,nome,criado_em`,[nome,text(req.body.observacao,1000),req.user.id]);
    const {rows:diretores}=await client.query(`select id from diretores where ativo order by id for update`);
    const aplicados=[], rejeitados=[];
    for(const d of diretores) {
      const periodos=await obterPeriodos(d.id,(sql,p)=>client.query(sql,p));
      try {
        validarNovoPeriodo(periodos,inicio,fim);
        await client.query(`insert into ferias_periodos(diretor_id,lote_id,data_inicio,data_fim,link_drive,observacao,criado_por) values($1,$2,$3,$4,$5,$6,$7)`,[d.id,lote.id,inicio,fim,text(req.body.link_drive,1000),text(req.body.observacao,2000),req.user.id]);
        aplicados.push(d.id);
      } catch(e) { rejeitados.push({diretor_id:d.id,motivo:e.message}); }
    }
    await client.query('commit'); await auditFerias(req,'criar','ferias_lotes',lote.id);
    res.status(201).json({lote,aplicados:aplicados.length,rejeitados});
  } catch(e) { await client.query('rollback'); throw e; } finally { client.release(); }
}));
router.get('/lotes', wrap(async(req,res)=>{
  if(!isManager(req.user)) throw new HttpError(403,'Sem permissão para consultar lotes.');
  res.json((await q(`select l.id,l.nome,l.observacao,l.criado_em,count(p.id)::int as periodos,min(p.data_inicio) as data_inicio,max(p.data_fim) as data_fim from ferias_lotes l left join ferias_periodos p on p.lote_id=l.id group by l.id order by l.criado_em desc limit 200`)).rows);
}));
router.put('/lotes/:id', admin('admin','superintendente'), wrap(async(req,res)=>{
  const id=Number(req.params.id),inicio=req.body.data_inicio,fim=req.body.data_fim;
  if(!idNum(id)||!dataValida(inicio)||!dataValida(fim)) throw new HttpError(400,'Dados do lote inválidos.');
  const client=await pool.connect();
  try {
    await client.query('begin');
    const {rows:[lote]}=await client.query(`select id from ferias_lotes where id=$1 for update`,[id]);
    if(!lote) throw new HttpError(404,'Lote não encontrado.');
    const {rows:participantes}=await client.query(`select id as diretor_id from diretores where id in (select diretor_id from ferias_periodos where lote_id=$1) order by id for update`,[id]);
    for(const item of participantes){
      const outros=(await client.query(`select id,data_inicio,data_fim from ferias_periodos where diretor_id=$1 and (lote_id is null or lote_id<>$2)`,[item.diretor_id,id])).rows;
      validarNovoPeriodo(outros,inicio,fim);
    }
    await client.query(`update ferias_periodos set data_inicio=$1,data_fim=$2,link_drive=$3,observacao=$4,atualizado_em=now() where lote_id=$5`,[inicio,fim,text(req.body.link_drive,1000),text(req.body.observacao,2000),id]);
    await client.query(`update ferias_lotes set nome=$1,observacao=$2,atualizado_em=now() where id=$3`,[text(req.body.nome,150)||'Lote de férias',text(req.body.observacao,1000),id]);
    await client.query('commit');await auditFerias(req,'editar','ferias_lotes',id);res.json({ok:true});
  }catch(e){await client.query('rollback');if(e.message.includes('período')||e.message.includes('limite')||e.message.includes('saldo'))throw new HttpError(400,e.message);throw e;}finally{client.release();}
}));
router.delete('/lotes/:id', admin('admin','superintendente'), wrap(async(req,res)=>{
  const id=Number(req.params.id); const client=await pool.connect();
  try { await client.query('begin'); const {rowCount}=await client.query(`select id from ferias_lotes where id=$1 for update`,[id]); if(!rowCount) throw new HttpError(404,'Lote não encontrado.'); await client.query(`delete from ferias_periodos where lote_id=$1`,[id]); await client.query(`delete from ferias_lotes where id=$1`,[id]); await client.query('commit'); await auditFerias(req,'excluir','ferias_lotes',id); res.json({ok:true}); }
  catch(e){await client.query('rollback');throw e;} finally{client.release();}
}));

router.get('/afastamentos', wrap(async(req,res)=>{
  const did=Number(req.query.diretor_id);
  if(!idNum(did)||!(await diretorPermitido(req.user,did))) throw new HttpError(403,'Sem permissão para consultar afastamentos.');
  res.json((await q(`select id,diretor_id,tipo,data_inicio,data_fim,dias_uteis,observacao,criado_em from afastamentos where diretor_id=$1 order by data_inicio desc`,[did])).rows);
}));
router.post('/afastamentos', wrap(async(req,res)=>{
  const did=Number(req.body.diretor_id); if(!idNum(did)||!(await diretorPermitido(req.user,did))) throw new HttpError(403,'Sem permissão para lançar afastamento.');
  if(!(await q(`select 1 from diretores where id=$1 and ativo`,[did])).rowCount) throw new HttpError(404,'Diretor não encontrado.');
  const tipo=text(req.body.tipo,100),inicio=req.body.data_inicio,fim=req.body.data_fim;
  if(!tipo||!dataValida(inicio)||!dataValida(fim)) throw new HttpError(400,'Informe tipo e datas válidas.');
  let uteis; try{uteis=validarAfastamento(inicio,fim,Array.isArray(req.body.feriados)?req.body.feriados.filter(dataValida):[]);}catch(e){throw new HttpError(400,e.message);}
  const {rows:[r]}=await q(`insert into afastamentos(diretor_id,tipo,data_inicio,data_fim,dias_uteis,observacao,criado_por) values($1,$2,$3,$4,$5,$6,$7) returning id,diretor_id,tipo,data_inicio,data_fim,dias_uteis,observacao`,[did,tipo,inicio,fim,uteis,text(req.body.observacao,2000),req.user.id]);
  await auditFerias(req,'criar','afastamentos',r.id); res.status(201).json(r);
}));
router.delete('/afastamentos/:id', admin('admin','superintendente'), wrap(async(req,res)=>{
  const id=Number(req.params.id); const {rowCount}=await q(`delete from afastamentos where id=$1`,[id]); if(!rowCount) throw new HttpError(404,'Afastamento não encontrado.');
  await auditFerias(req,'excluir','afastamentos',id); res.json({ok:true});
}));

function resumoPublico(dados) {
  return { diretor:dados.diretor, escola:dados.escola, periodos:dados.periodos.map(p=>({data_inicio:p.data_inicio,data_fim:p.data_fim,dias:diasCorridos(p.data_inicio,p.data_fim)})), saldo:dados.saldo };
}
publicRouter.get('/', (req,res,next)=>{
  const now=Date.now(); req.app.locals.publicHits ||= new Map(); const m=req.app.locals.publicHits; const k=req.ip||'ip';
  const h=m.get(k)||{at:now,n:0}; if(now-h.at>60000){h.at=now;h.n=0;} h.n++;m.set(k,h);
  if(h.n>60)return res.status(429).json({erro:'Limite de consultas excedido.'}); next();
},wrap(async(_req,res)=>{
  const {rows}=await q(`select d.id,d.nome,e.nome as escola from diretores d join escolas e on e.id=d.escola_id where d.ativo and e.ativo order by d.nome`);
  const result=[];
  for(const d of rows){const s=await saldoDiretor(d.id);result.push(resumoPublico({diretor:d.nome,escola:d.escola,periodos:s.periodos,saldo:s.saldo}));}
  res.set('Cache-Control','public, max-age=60');res.json(result);
}));
router.post('/extratos',wrap(async(req,res)=>{
  const did=Number(req.body.diretor_id);
  if(!idNum(did)||!(await diretorPermitido(req.user,did)))throw new HttpError(403,'Sem permissão para emitir este extrato.');
  const {rows:[d]}=await q(`select d.id,d.nome,e.nome as escola from diretores d join escolas e on e.id=d.escola_id where d.id=$1`,[did]);
  if(!d)throw new HttpError(404,'Diretor não encontrado.');
  const s=await saldoDiretor(did);const resumo=resumoPublico({diretor:d.nome,escola:d.escola,periodos:s.periodos,saldo:s.saldo});
  const codigo=crypto.randomUUID().toUpperCase();const hash=crypto.createHash('sha256').update(jsonCanonico(resumo)).digest('hex');
  await q(`insert into documentos_autenticidade(codigo,tipo,diretor_id,resumo,hash_sha256,criado_por) values($1,'extrato_ferias',$2,$3,$4,$5)`,[codigo,did,JSON.stringify(resumo),hash,req.user.id]);
  res.status(201).json({codigo,resumo,emitido_em:new Date().toISOString(),url_verificacao:`/api/ferias/publico/verificar/${codigo}`});
}));
router.post('/relatorios',admin('admin','superintendente'),wrap(async(req,res)=>{
  const {rows:diretores}=await q(`select d.id,d.nome,e.nome as escola from diretores d join escolas e on e.id=d.escola_id where d.ativo and e.ativo order by d.nome`);
  const resumo=[];
  for(const d of diretores){const s=await saldoDiretor(d.id);resumo.push(resumoPublico({diretor:d.nome,escola:d.escola,periodos:s.periodos,saldo:s.saldo}));}
  const codigo=crypto.randomUUID().toUpperCase();const hash=crypto.createHash('sha256').update(jsonCanonico(resumo)).digest('hex');
  await q(`insert into documentos_autenticidade(codigo,tipo,resumo,hash_sha256,criado_por) values($1,'relatorio_ferias',$2,$3,$4)`,[codigo,JSON.stringify(resumo),hash,req.user.id]);
  res.status(201).json({codigo,quantidade:resumo.length,url_verificacao:`/api/ferias/publico/verificar/${codigo}`});
}));
publicRouter.get('/verificar/:codigo',wrap(async(req,res)=>{
  const codigo=String(req.params.codigo||'').toUpperCase();
  const {rows:[doc]}=await q(`select tipo,resumo,hash_sha256,criado_em from documentos_autenticidade where codigo=$1 and tipo in ('extrato_ferias','relatorio_ferias')`,[codigo]);
  if(!doc)return res.status(404).json({valido:false,erro:'Código não encontrado.'});
  const hash=crypto.createHash('sha256').update(jsonCanonico(doc.resumo)).digest('hex');
  res.json({valido:hash===doc.hash_sha256,tipo:doc.tipo,codigo,criado_em:doc.criado_em,resumo:doc.resumo});
}));

module.exports={router,publicRouter};
