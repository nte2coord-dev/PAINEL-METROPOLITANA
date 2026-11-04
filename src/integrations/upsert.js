'use strict';
const ALLOWED_TABLES=new Set(['escolas','diretores','ferias_lotes','ferias_periodos','afastamentos']);
const IDENT=/^[a-z_][a-z0-9_]*$/;
async function upsertExterno(client,tabela,dados){
 if(!ALLOWED_TABLES.has(tabela))throw new Error('Tabela de destino não autorizada.');
 if(!dados||typeof dados!=='object'||!dados.fonte||!dados.id_externo)throw new Error('A fonte e o id_externo são obrigatórios para upsert.');
 const cols=Object.keys(dados);
 if(cols.some(c=>!IDENT.test(c)))throw new Error('Nome de coluna inválido.');
 const columns=cols.join(',');const values=cols.map((_,i)=>`$${i+1}`).join(',');
 const updates=cols.filter(c=>!['fonte','id_externo','criado_em'].includes(c));
 const set=updates.map(c=>`${c}=excluded.${c}`).concat(cols.includes('atualizado_em')?[]:['atualizado_em=now()']).join(',');
 if(!set)throw new Error('Nenhuma coluna atualizável.');
 const sql=`insert into ${tabela} (${columns}) values (${values}) on conflict (fonte,id_externo) do update set ${set} returning id,(xmax=0) as criado`;
 return (await client.query(sql,cols.map(c=>dados[c]))).rows[0];
}
module.exports={upsertExterno};
