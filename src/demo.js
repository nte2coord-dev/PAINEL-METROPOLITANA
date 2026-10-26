// Dados fictícios para demonstração (SEED_DEMO=true). Só roda se não houver demandas.
const bcrypt = require('bcryptjs');
const { q } = require('./db');

let seedN = 42;
const rnd = () => (seedN = (seedN * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const addDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function run() {
  if ((await q(`select count(*)::int n from demandas`)).rows[0].n > 0) return;
  const hash = await bcrypt.hash('Painel@2026', 10);
  const units = (await q(`select * from units`)).rows;
  for (const u of units) {
    const slug = u.sigla.toLowerCase().replace(/[^a-z]/g, '');
    await q(`insert into users (nome,email,senha_hash,perfil,unit_id) values ($1,$2,$3,'diretor',$4) on conflict do nothing`,
      [`Diretor(a) ${u.sigla}`, `diretor.${slug}@educacao.mg.gov.br`, hash, u.id]);
  }
  await q(`insert into users (nome,email,senha_hash,perfil) values ('Superintendente','superintendente@educacao.mg.gov.br',$1,'superintendente') on conflict do nothing`, [hash]);
  const setores = (await q(`select * from sectors`)).rows;
  let i = 0;
  for (const s of setores) {
    i++;
    await q(`insert into users (nome,email,senha_hash,perfil,unit_id,sector_id) values ($1,$2,$3,'coord_setor',$4,$5) on conflict do nothing`,
      [`Coord. ${s.nome}`.slice(0, 80), `coord${i}@educacao.mg.gov.br`, hash, s.unit_id, s.id]);
    const n = 8 + Math.floor(rnd() * 14);
    const dem = [];
    for (let k = 0; k < n; k++) {
      const entrada = -Math.floor(rnd() * 90);
      const prazo = entrada + 5 + Math.floor(rnd() * 40);
      const r = rnd();
      const concl = r < 0.4;
      const status = concl ? 'concluida' : pick(['aberta', 'em_andamento', 'aguardando_terceiros']);
      const dc = concl ? Math.min(0, entrada + 2 + Math.floor(rnd() * 45)) : null;
      const { rows } = await q(
        `insert into demandas (sector_id,processo,assunto,origem,data_entrada,prazo,prioridade,responsavel,status,data_conclusao)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [s.id, `1260.01.${String(1000000 + i * 1000 + k)}/2026-${10 + k}`,
          pick(['Solicitação de escola', 'Ofício', 'Prestação de contas', 'Processo de servidor', 'Demanda do MP', 'Resposta ao TCE']),
          pick(['escola', 'servidor', 'mp', 'tce', 'ouvidoria', 'outra_unidade']),
          addDias(entrada), addDias(prazo), pick(['baixa', 'media', 'media', 'alta', 'urgente']),
          pick(['Ana', 'Bruno', 'Carla', 'Diego']), status, dc != null ? addDias(dc) : null]);
      dem.push(rows[0].id);
    }
    if (dem.length) await q(`insert into acompanhamentos (demanda_id, texto, tipo) values ($1,'Processo encaminhado para análise.','despacho')`, [dem[0]]);
  }
  console.log('[demo] dados fictícios criados. Senha de todos os usuários demo: Painel@2026 (ex.: superintendente@educacao.mg.gov.br)');
}
module.exports = { run };
