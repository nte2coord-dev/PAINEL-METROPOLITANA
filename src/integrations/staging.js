'use strict';
const RAW_TABLES=new Set(['dipe_raw','appsscript_raw']);
async function guardarRaw(client,fonte,idExterno,payload){
 const table=fonte==='dipe'?'dipe_raw':fonte==='appsscript'?'appsscript_raw':null;
 if(!RAW_TABLES.has(table))throw new Error('Fonte de staging inválida.');
 const {rows:[r]}=await client.query(`insert into ${table}(id_externo,payload) values($1,$2) on conflict(id_externo) do update set payload=excluded.payload,atualizado_em=now(),processado_em=null,erro=null returning id`,[idExterno||null,JSON.stringify(payload)]);
 return r.id;
}
async function importarLote({client,fonte,registros,extrairId,normalizar,gravar}){
 const resumo={lidos:registros.length,criados:0,atualizados:0,rejeitados:0};
 for(let i=0;i<registros.length;i++){
   const original=registros[i],savepoint=`item_${i}`;
   const idExterno=extrairId?extrairId(original):null;
   const rawId=await guardarRaw(client,fonte,idExterno,original);
   await client.query(`savepoint ${savepoint}`);
   try{
     const dado=await normalizar(original);
     const r=await gravar(dado,idExterno);
     if(r.criado)resumo.criados++;else resumo.atualizados++;
     await client.query(`update ${fonte==='dipe'?'dipe_raw':'appsscript_raw'} set processado_em=now(),erro=null where id=$1`,[rawId]);
     await client.query(`release savepoint ${savepoint}`);
   }catch(e){
     await client.query(`rollback to savepoint ${savepoint}`);await client.query(`release savepoint ${savepoint}`);
     resumo.rejeitados++;
     const motivo=String(e.message||'Registro inválido.').slice(0,250);
     await client.query(`insert into pendencias_importacao(fonte,raw_id,motivo) values($1,$2,$3)`,[fonte,rawId,motivo]);
     await client.query(`update ${fonte==='dipe'?'dipe_raw':'appsscript_raw'} set erro=$1 where id=$2`,[motivo,rawId]);
   }
 }
 return resumo;
}
module.exports={guardarRaw,importarLote};
