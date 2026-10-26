const router = require('express').Router();
const { q } = require('../db');
const {
  wrap, HttpError, requireAuth, sectorScope, canSeeSector, canWrite, audit,
  prazoStatusSql, isDate, str,
} = require('../util');

router.use(requireAuth);

const ORIGENS = ['escola', 'servidor', 'mp', 'tce', 'ouvidoria', 'outra_unidade'];
const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];
const STATUS = ['aberta', 'em_andamento', 'aguardando_terceiros', 'concluida', 'cancelada'];

const hoje = () => new Date().toISOString().slice(0, 10);

function validarDemanda(b, parcial = false) {
  const erros = [];
  const d = {
    processo: str(b.processo, 100), assunto: str(b.assunto, 300),
    tipo_id: b.tipo_id ? Number(b.tipo_id) : null,
    origem: b.origem || 'outra_unidade', data_entrada: b.data_entrada || hoje(),
    prazo: b.prazo, prioridade: b.prioridade || 'media', responsavel: str(b.responsavel, 150),
    status: b.status || 'aberta', data_conclusao: b.data_conclusao || null,
    observacoes: str(b.observacoes, 4000),
  };
  if (!d.processo) erros.push('Informe o nº do processo SEI ou protocolo.');
  if (!d.assunto) erros.push('Informe o assunto.');
  if (!ORIGENS.includes(d.origem)) erros.push('Origem inválida.');
  if (!PRIORIDADES.includes(d.prioridade)) erros.push('Prioridade inválida.');
  if (!STATUS.includes(d.status)) erros.push('Status inválido.');
  if (!isDate(d.data_entrada)) erros.push('Data de entrada inválida.');
  if (!isDate(d.prazo)) erros.push('Informe o prazo (data limite).');
  if (d.data_conclusao && !isDate(d.data_conclusao)) erros.push('Data de conclusão inválida.');
  if (!erros.length) {
    if (d.prazo < d.data_entrada) erros.push('O prazo não pode ser anterior à data de entrada.');
    if (d.status === 'concluida' && !d.data_conclusao) d.data_conclusao = hoje();
    if (d.status !== 'concluida') d.data_conclusao = null;
    if (d.data_conclusao && d.data_conclusao < d.data_entrada) {
      erros.push('A data de conclusão não pode ser anterior à data de entrada.');
    }
  }
  if (erros.length) throw new HttpError(400, erros.join(' '));
  return d;
}

const DEMANDA_SELECT = () => `
  select d.*, ${prazoStatusSql('d')} as prazo_status, (d.prazo - current_date) as dias_para_vencer,
         s.nome as setor, s.unit_id, u.sigla as unidade, t.nome as tipo
    from demandas d join sectors s on s.id = d.sector_id join units u on u.id = s.unit_id
    left join tipos_demanda t on t.id = d.tipo_id`;

router.get('/demandas', wrap(async (req, res) => {
  const sc = sectorScope(req.user, 's', 1);
  const params = [...sc.params];
  const where = [sc.sql];
  const add = (cond, v) => { params.push(v); where.push(cond.replace('?', `$${params.length}`)); };
  if (req.query.sector_id) add('d.sector_id = ?', Number(req.query.sector_id));
  if (req.query.unit_id) add('s.unit_id = ?', Number(req.query.unit_id));
  if (req.query.status) add('d.status = ?', req.query.status);
  if (req.query.prioridade) add('d.prioridade = ?', req.query.prioridade);
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    const n = params.length;
    where.push(`(d.processo ilike $${n} or d.assunto ilike $${n} or d.responsavel ilike $${n})`);
  }
  const sql = `select * from (${DEMANDA_SELECT()} where ${where.join(' and ')}) x
     ${req.query.prazo_status ? `where prazo_status = $${params.push(req.query.prazo_status)}` : ''}
     order by (prazo_status = 'fora') desc, prazo asc limit ${Math.min(Number(req.query.limit) || 200, 1000)}
     offset ${Number(req.query.offset) || 0}`;
  res.json((await q(sql, params)).rows);
}));

router.get('/demandas/:id', wrap(async (req, res) => {
  const { rows } = await q(`${DEMANDA_SELECT()} where d.id = $1`, [req.params.id]);
  if (!rows[0] || !(await canSeeSector(req.user, rows[0].sector_id))) throw new HttpError(404, 'Demanda não encontrada.');
  res.json(rows[0]);
}));

async function inserirDemanda(req, sectorId, d) {
  const { rows } = await q(
    `insert into demandas (sector_id, processo, assunto, tipo_id, origem, data_entrada, prazo, prioridade,
       responsavel, status, data_conclusao, observacoes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [sectorId, d.processo, d.assunto, d.tipo_id, d.origem, d.data_entrada, d.prazo, d.prioridade,
      d.responsavel, d.status, d.data_conclusao, d.observacoes, req.user.id]);
  await audit(req, 'criar', 'demandas', rows[0].id, null, rows[0]);
  return rows[0];
}

router.post('/demandas', wrap(async (req, res) => {
  const sectorId = Number(req.body.sector_id || req.user.sector_id);
  if (!canWrite(req.user, sectorId)) throw new HttpError(403, 'Você só pode lançar dados do seu setor.');
  res.status(201).json(await inserirDemanda(req, sectorId, validarDemanda(req.body)));
}));

router.put('/demandas/:id', wrap(async (req, res) => {
  const { rows: [antes] } = await q(`select * from demandas where id = $1`, [req.params.id]);
  if (!antes || !canWrite(req.user, antes.sector_id)) throw new HttpError(403, 'Sem permissão para editar esta demanda.');
  const d = validarDemanda({ ...antes, ...req.body });
  const { rows } = await q(
    `update demandas set processo=$1, assunto=$2, tipo_id=$3, origem=$4, data_entrada=$5, prazo=$6,
       prioridade=$7, responsavel=$8, status=$9, data_conclusao=$10, observacoes=$11, updated_at=now()
     where id=$12 returning *`,
    [d.processo, d.assunto, d.tipo_id, d.origem, d.data_entrada, d.prazo, d.prioridade, d.responsavel,
      d.status, d.data_conclusao, d.observacoes, antes.id]);
  await audit(req, 'editar', 'demandas', antes.id, antes, rows[0]);
  res.json(rows[0]);
}));

router.delete('/demandas/:id', wrap(async (req, res) => {
  const { rows: [antes] } = await q(`select * from demandas where id = $1`, [req.params.id]);
  if (!antes || !canWrite(req.user, antes.sector_id)) throw new HttpError(403, 'Sem permissão para excluir.');
  await q(`delete from demandas where id = $1`, [antes.id]);
  await audit(req, 'excluir', 'demandas', antes.id, antes, null);
  res.json({ ok: true });
}));

// Importação em lote (o front converte CSV em JSON). Tudo-ou-nada, com relatório de erros por linha.
router.post('/demandas/importar', wrap(async (req, res) => {
  const sectorId = Number(req.body.sector_id || req.user.sector_id);
  if (!canWrite(req.user, sectorId)) throw new HttpError(403, 'Você só pode importar para o seu setor.');
  const linhas = Array.isArray(req.body.linhas) ? req.body.linhas.slice(0, 2000) : [];
  const validas = []; const erros = [];
  linhas.forEach((l, i) => {
    try { validas.push(validarDemanda(l)); } catch (e) { erros.push({ linha: i + 2, erro: e.message }); }
  });
  if (erros.length) return res.status(400).json({ erro: 'Há linhas com problema; nada foi importado.', erros });
  for (const d of validas) await inserirDemanda(req, sectorId, d);
  res.status(201).json({ importadas: validas.length });
}));

router.get('/modelo-demandas.csv', (_req, res) => {
  res.type('text/csv; charset=utf-8').attachment('modelo-demandas.csv').send(
    '﻿processo,assunto,origem,data_entrada,prazo,prioridade,responsavel,status,data_conclusao,observacoes\n' +
    '1260.01.0000000/2026-00,Exemplo de assunto,escola,2026-10-01,2026-10-30,media,Fulano,aberta,,\n');
});

// ---------- Acompanhamentos (linha do tempo) ----------
router.get('/demandas/:id/acompanhamentos', wrap(async (req, res) => {
  const { rows: [d] } = await q(`select sector_id from demandas where id = $1`, [req.params.id]);
  if (!d || !(await canSeeSector(req.user, d.sector_id))) throw new HttpError(404, 'Demanda não encontrada.');
  res.json((await q(
    `select a.*, u.nome as autor from acompanhamentos a left join users u on u.id = a.user_id
      where demanda_id = $1 order by a.data desc, a.id desc`, [req.params.id])).rows);
}));

router.post('/demandas/:id/acompanhamentos', wrap(async (req, res) => {
  const { rows: [d] } = await q(`select sector_id from demandas where id = $1`, [req.params.id]);
  if (!d) throw new HttpError(404, 'Demanda não encontrada.');
  const ehDiretorDaUnidade = req.user.perfil === 'diretor' && (await canSeeSector(req.user, d.sector_id));
  if (!canWrite(req.user, d.sector_id) && !ehDiretorDaUnidade && req.user.perfil !== 'superintendente') {
    throw new HttpError(403, 'Sem permissão para registrar acompanhamento.');
  }
  const texto = str(req.body.texto, 4000);
  if (!texto) throw new HttpError(400, 'Escreva o registro.');
  const tipo = ['andamento', 'contato', 'despacho', 'reuniao', 'comentario'].includes(req.body.tipo) ? req.body.tipo : 'andamento';
  const data = req.body.data || hoje();
  if (!isDate(data)) throw new HttpError(400, 'Data inválida.');
  const { rows } = await q(
    `insert into acompanhamentos (demanda_id, data, tipo, texto, user_id) values ($1,$2,$3,$4,$5) returning *`,
    [req.params.id, data, tipo, texto, req.user.id]);
  await audit(req, 'criar', 'acompanhamentos', rows[0].id, null, rows[0]);
  res.status(201).json(rows[0]);
}));

// ---------- Pendências ----------
router.get('/pendencias', wrap(async (req, res) => {
  const sc = sectorScope(req.user, 's', 1);
  const params = [...sc.params]; let extra = '';
  if (req.query.sector_id) { params.push(Number(req.query.sector_id)); extra += ` and p.sector_id = $${params.length}`; }
  res.json((await q(
    `select p.*, s.nome as setor, u.sigla as unidade, d.processo,
            (not p.resolvida and p.prazo < current_date) as atrasada
       from pendencias p join sectors s on s.id = p.sector_id join units u on u.id = s.unit_id
       left join demandas d on d.id = p.demanda_id
      where ${sc.sql} ${extra} order by p.resolvida, p.prazo nulls last limit 500`, params)).rows);
}));

function validarPendencia(b) {
  const d = { descricao: str(b.descricao, 1000), motivo: str(b.motivo, 1000), responsavel: str(b.responsavel, 150),
    prazo: b.prazo || null, demanda_id: b.demanda_id ? Number(b.demanda_id) : null, resolvida: !!b.resolvida };
  if (!d.descricao) throw new HttpError(400, 'Descreva o que falta.');
  if (d.prazo && !isDate(d.prazo)) throw new HttpError(400, 'Prazo inválido.');
  return d;
}

router.post('/pendencias', wrap(async (req, res) => {
  const sectorId = Number(req.body.sector_id || req.user.sector_id);
  if (!canWrite(req.user, sectorId)) throw new HttpError(403, 'Você só pode lançar dados do seu setor.');
  const p = validarPendencia(req.body);
  if (p.demanda_id) {
    const { rowCount } = await q(`select 1 from demandas where id = $1 and sector_id = $2`, [p.demanda_id, sectorId]);
    if (!rowCount) throw new HttpError(400, 'A demanda vinculada não pertence ao setor.');
  }
  const { rows } = await q(
    `insert into pendencias (sector_id, demanda_id, descricao, motivo, responsavel, prazo, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [sectorId, p.demanda_id, p.descricao, p.motivo, p.responsavel, p.prazo, req.user.id]);
  await audit(req, 'criar', 'pendencias', rows[0].id, null, rows[0]);
  res.status(201).json(rows[0]);
}));

router.put('/pendencias/:id', wrap(async (req, res) => {
  const { rows: [antes] } = await q(`select * from pendencias where id = $1`, [req.params.id]);
  if (!antes || !canWrite(req.user, antes.sector_id)) throw new HttpError(403, 'Sem permissão.');
  const p = validarPendencia({ ...antes, ...req.body });
  const { rows } = await q(
    `update pendencias set descricao=$1, motivo=$2, responsavel=$3, prazo=$4, demanda_id=$5, resolvida=$6, updated_at=now()
      where id=$7 returning *`,
    [p.descricao, p.motivo, p.responsavel, p.prazo, p.demanda_id, p.resolvida, antes.id]);
  await audit(req, 'editar', 'pendencias', antes.id, antes, rows[0]);
  res.json(rows[0]);
}));

router.delete('/pendencias/:id', wrap(async (req, res) => {
  const { rows: [antes] } = await q(`select * from pendencias where id = $1`, [req.params.id]);
  if (!antes || !canWrite(req.user, antes.sector_id)) throw new HttpError(403, 'Sem permissão.');
  await q(`delete from pendencias where id = $1`, [antes.id]);
  await audit(req, 'excluir', 'pendencias', antes.id, antes, null);
  res.json({ ok: true });
}));

// ---------- Consolidado do período ----------
router.get('/consolidados', wrap(async (req, res) => {
  const sc = sectorScope(req.user, 's', 1);
  const params = [...sc.params]; let extra = '';
  if (req.query.sector_id) { params.push(Number(req.query.sector_id)); extra = ` and c.sector_id = $${params.length}`; }
  res.json((await q(
    `select c.*, s.nome as setor from consolidados c join sectors s on s.id = c.sector_id
      where ${sc.sql} ${extra} order by c.periodo_fim desc limit 100`, params)).rows);
}));

// Sugere os totais a partir das demandas lançadas (o coordenador confere e ajusta)
router.get('/consolidados/sugestao', wrap(async (req, res) => {
  const sectorId = Number(req.query.sector_id);
  const { inicio, fim } = req.query;
  if (!(await canSeeSector(req.user, sectorId)) || !isDate(inicio) || !isDate(fim)) throw new HttpError(400, 'Parâmetros inválidos.');
  const { rows: [r] } = await q(
    `select count(*) filter (where data_entrada between $2 and $3)::int as recebidas,
            count(*) filter (where data_conclusao between $2 and $3)::int as concluidas,
            count(*) filter (where status not in ('concluida','cancelada') and data_entrada <= $3)::int as em_aberto,
            round(avg(data_conclusao - data_entrada) filter (where data_conclusao between $2 and $3), 1) as tempo_medio_dias
       from demandas where sector_id = $1`, [sectorId, inicio, fim]);
  res.json(r);
}));

router.post('/consolidados', wrap(async (req, res) => {
  const b = req.body; const sectorId = Number(b.sector_id || req.user.sector_id);
  if (!canWrite(req.user, sectorId)) throw new HttpError(403, 'Você só pode lançar dados do seu setor.');
  if (!isDate(b.periodo_inicio) || !isDate(b.periodo_fim) || b.periodo_fim < b.periodo_inicio) {
    throw new HttpError(400, 'Período inválido.');
  }
  const n = v => Math.max(0, parseInt(v, 10) || 0);
  const tm = b.tempo_medio_dias === '' || b.tempo_medio_dias == null ? null : Math.max(0, Number(b.tempo_medio_dias));
  const { rows } = await q(
    `insert into consolidados (sector_id, periodo_inicio, periodo_fim, recebidas, concluidas, em_aberto, tempo_medio_dias, observacoes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (sector_id, periodo_inicio, periodo_fim) do update set recebidas=excluded.recebidas,
       concluidas=excluded.concluidas, em_aberto=excluded.em_aberto, tempo_medio_dias=excluded.tempo_medio_dias,
       observacoes=excluded.observacoes returning *`,
    [sectorId, b.periodo_inicio, b.periodo_fim, n(b.recebidas), n(b.concluidas), n(b.em_aberto), tm, str(b.observacoes, 2000), req.user.id]);
  await audit(req, 'salvar', 'consolidados', rows[0].id, null, rows[0]);
  res.status(201).json(rows[0]);
}));

// ---------- Indicadores ----------
router.get('/indicadores', wrap(async (req, res) => {
  const sc = sectorScope(req.user, 's', 1);
  const params = [...sc.params]; let extra = '';
  if (req.query.sector_id) { params.push(Number(req.query.sector_id)); extra = ` and i.sector_id = $${params.length}`; }
  res.json((await q(
    `select i.*, s.nome as setor, u.sigla as unidade from indicadores i
       join sectors s on s.id = i.sector_id join units u on u.id = s.unit_id
      where ${sc.sql} ${extra} order by u.ordem, s.nome, i.nome`, params)).rows);
}));

function validarIndicador(b) {
  const nome = str(b.nome, 200); const meta = Number(b.meta);
  if (!nome) throw new HttpError(400, 'Informe o nome do indicador.');
  if (!Number.isFinite(meta)) throw new HttpError(400, 'Informe a meta.');
  const realizado = b.realizado === '' || b.realizado == null ? null : Number(b.realizado);
  if (realizado !== null && !Number.isFinite(realizado)) throw new HttpError(400, 'Valor realizado inválido.');
  return {
    nome, meta, realizado,
    unidade: ['pct', 'num', 'dias'].includes(b.unidade) ? b.unidade : 'num',
    periodicidade: ['quinzenal', 'mensal', 'trimestral', 'anual'].includes(b.periodicidade) ? b.periodicidade : 'mensal',
    menor_melhor: !!b.menor_melhor,
  };
}

router.post('/indicadores', wrap(async (req, res) => {
  const sectorId = Number(req.body.sector_id || req.user.sector_id);
  if (!canWrite(req.user, sectorId)) throw new HttpError(403, 'Você só pode lançar dados do seu setor.');
  const i = validarIndicador(req.body);
  const { rows } = await q(
    `insert into indicadores (sector_id, nome, meta, realizado, unidade, periodicidade, menor_melhor)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [sectorId, i.nome, i.meta, i.realizado, i.unidade, i.periodicidade, i.menor_melhor]);
  await audit(req, 'criar', 'indicadores', rows[0].id, null, rows[0]);
  res.status(201).json(rows[0]);
}));

router.put('/indicadores/:id', wrap(async (req, res) => {
  const { rows: [antes] } = await q(`select * from indicadores where id = $1`, [req.params.id]);
  if (!antes || !canWrite(req.user, antes.sector_id)) throw new HttpError(403, 'Sem permissão.');
  const i = validarIndicador({ ...antes, ...req.body });
  const { rows } = await q(
    `update indicadores set nome=$1, meta=$2, realizado=$3, unidade=$4, periodicidade=$5, menor_melhor=$6, updated_at=now()
      where id=$7 returning *`,
    [i.nome, i.meta, i.realizado, i.unidade, i.periodicidade, i.menor_melhor, antes.id]);
  await audit(req, 'editar', 'indicadores', antes.id, antes, rows[0]);
  res.json(rows[0]);
}));

router.delete('/indicadores/:id', wrap(async (req, res) => {
  const { rows: [antes] } = await q(`select * from indicadores where id = $1`, [req.params.id]);
  if (!antes || !canWrite(req.user, antes.sector_id)) throw new HttpError(403, 'Sem permissão.');
  await q(`delete from indicadores where id = $1`, [antes.id]);
  await audit(req, 'excluir', 'indicadores', antes.id, antes, null);
  res.json({ ok: true });
}));

module.exports = router;
