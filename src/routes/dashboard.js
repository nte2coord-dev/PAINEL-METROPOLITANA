const router = require('express').Router();
const { q } = require('../db');
const { wrap, requireAuth, sectorScope, prazoStatusSql } = require('../util');

router.use(requireAuth);

// "Atrasada" = vencida e aberta, ou concluída depois do prazo (usada em tendência e mapa de calor)
const ATRASADA = `(d.status not in ('concluida','cancelada') and d.prazo < current_date
                   or d.status = 'concluida' and d.data_conclusao > d.prazo)`;

function filtros(req) {
  const sc = sectorScope(req.user, 's', 1);
  const params = [...sc.params]; const where = [sc.sql];
  if (req.query.unit_id) { params.push(Number(req.query.unit_id)); where.push(`s.unit_id = $${params.length}`); }
  if (req.query.sector_id) { params.push(Number(req.query.sector_id)); where.push(`s.id = $${params.length}`); }
  return { params, where: where.join(' and ') };
}

router.get('/resumo', wrap(async (req, res) => {
  const { params, where } = filtros(req);
  const ps = prazoStatusSql('d');
  const base = `from demandas d join sectors s on s.id = d.sector_id join units u on u.id = s.unit_id where ${where}`;

  const kpis = (await q(
    `select count(*)::int as total,
       count(*) filter (where ${ps} = 'no_prazo')::int as no_prazo,
       count(*) filter (where ${ps} = 'breve')::int as vence_em_breve,
       count(*) filter (where ${ps} = 'fora')::int as fora_do_prazo,
       count(*) filter (where ${ps} = 'concluida')::int as concluidas,
       count(*) filter (where d.status not in ('concluida','cancelada'))::int as pendentes,
       count(*) filter (where ${ps} = 'cancelada')::int as canceladas
     ${base}`, params)).rows[0];

  const porUnidade = (await q(
    `select u.id, u.sigla, u.nome,
       count(d.id)::int as total,
       count(d.id) filter (where ${ps} = 'no_prazo')::int as no_prazo,
       count(d.id) filter (where ${ps} = 'breve')::int as vence_em_breve,
       count(d.id) filter (where ${ps} = 'fora')::int as fora_do_prazo,
       count(d.id) filter (where ${ps} = 'concluida')::int as concluidas,
       count(d.id) filter (where ${ps} = 'cancelada')::int as canceladas,
       count(d.id) filter (where ${ATRASADA} and d.data_entrada >= current_date - 30)::int as atras_atual,
       count(d.id) filter (where d.data_entrada >= current_date - 30)::int as tot_atual,
       count(d.id) filter (where ${ATRASADA} and d.data_entrada < current_date - 30 and d.data_entrada >= current_date - 60)::int as atras_ant,
       count(d.id) filter (where d.data_entrada < current_date - 30 and d.data_entrada >= current_date - 60)::int as tot_ant
     from units u join sectors s on s.unit_id = u.id left join demandas d on d.sector_id = s.id
     where ${where} group by u.id order by u.ordem`, params)).rows
    .map(r => {
      const ativas = r.total - r.canceladas;
      const pct = ativas ? Math.round(100 * (ativas - r.fora_do_prazo) / ativas) : null;
      const pa = r.tot_atual ? 100 - 100 * r.atras_atual / r.tot_atual : null;
      const pp = r.tot_ant ? 100 - 100 * r.atras_ant / r.tot_ant : null;
      const tendencia = pa != null && pp != null ? Math.round(pa - pp) : null; // pontos percentuais
      const semaforo = pct == null ? 'cinza' : r.fora_do_prazo === 0 ? 'verde' : pct >= 80 ? 'amarelo' : 'vermelho';
      return { ...r, pct_no_prazo: pct, tendencia, semaforo };
    });

  const evolucao = (await q(
    `with meses as (select generate_series(date_trunc('month', current_date) - interval '11 months',
                                           date_trunc('month', current_date), interval '1 month')::date as m)
     select to_char(m, 'YYYY-MM') as mes,
       (select count(*) from demandas d join sectors s on s.id = d.sector_id
          where ${where} and date_trunc('month', d.data_entrada) = m)::int as recebidas,
       (select count(*) from demandas d join sectors s on s.id = d.sector_id
          where ${where} and date_trunc('month', d.data_conclusao) = m)::int as concluidas
     from meses order by m`, params)).rows;

  const ranking = (await q(
    `select s.id, s.nome as setor, u.sigla as unidade,
       count(d.id) filter (where ${ps} = 'fora')::int as fora_do_prazo,
       count(d.id) filter (where d.status not in ('concluida','cancelada'))::int as abertas
     from sectors s join units u on u.id = s.unit_id left join demandas d on d.sector_id = s.id
     where ${where} group by s.id, u.sigla, u.ordem
     having count(d.id) filter (where ${ps} = 'fora') > 0
     order by fora_do_prazo desc, s.nome limit 10`, params)).rows;

  // Mapa de calor: setores (com mais atrasos) × últimas 8 semanas (semana do prazo)
  const calor = (await q(
    `with semanas as (select generate_series(date_trunc('week', current_date) - interval '7 weeks',
                                             date_trunc('week', current_date), interval '1 week')::date as w),
     top as (select s.id, s.nome from sectors s join demandas d on d.sector_id = s.id
             join units u on u.id = s.unit_id where ${where} and ${ATRASADA}
             group by s.id order by count(*) desc limit 12)
     select t.nome as setor, to_char(w, 'DD/MM') as semana,
       (select count(*) from demandas d where d.sector_id = t.id and ${ATRASADA}
          and date_trunc('week', d.prazo) = w)::int as qtd
     from top t cross join semanas order by t.nome, w`, params)).rows;

  // Até 2 indicadores por unidade (cartões de unidade) e demandas mais recentes
  const indRows = (await q(
    `select i.nome, i.meta, i.realizado, i.unidade, i.menor_melhor, s.unit_id
       from indicadores i join sectors s on s.id = i.sector_id join units u on u.id = s.unit_id
      where ${where} and i.realizado is not null order by i.updated_at desc`, params)).rows;
  for (const u of porUnidade) u.indicadores = indRows.filter(i => i.unit_id === u.id).slice(0, 2);

  const recentes = (await q(
    `select d.id, d.processo, d.assunto, d.prazo, u.sigla as unidade, s.nome as setor
       ${base} order by d.created_at desc, d.id desc limit 6`, params)).rows;

  res.json({ kpis, porUnidade, evolucao, ranking, calor, recentes });
}));

// Próximos vencimentos / atrasos para a lista de ação
router.get('/proximos', wrap(async (req, res) => {
  const { params, where } = filtros(req);
  res.json((await q(
    `select d.id, d.processo, d.assunto, d.prazo, d.prioridade, d.responsavel, s.nome as setor, u.sigla as unidade,
            ${prazoStatusSql('d')} as prazo_status, (d.prazo - current_date) as dias_para_vencer
       from demandas d join sectors s on s.id = d.sector_id join units u on u.id = s.unit_id
      where ${where} and d.status not in ('concluida','cancelada') and d.prazo <= current_date + 7
      order by d.prazo limit 15`, params)).rows);
}));

module.exports = router;
