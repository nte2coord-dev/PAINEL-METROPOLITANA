// Dados fictícios para demonstração (SEED_DEMO=true). Só roda se não houver demandas.
const { q } = require('./db');

let seedN = 42;
const rnd = () => (seedN = (seedN * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const addDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function run() {
  if ((await q(`select count(*)::int n from demandas`)).rows[0].n > 0) return;
  const setores = (await q(`select * from sectors`)).rows;
  let i = 0;
  for (const s of setores) {
    i++;
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
  console.log('[demo] dados fictícios criados.');
}
module.exports = { run };
