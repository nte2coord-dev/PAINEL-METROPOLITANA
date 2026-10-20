/* Painel SRE Metropolitana A – SPA sem dependências. */
'use strict';

// ---------- utilidades ----------
class Raw { constructor(s) { this.s = s; } }
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = (strings, ...vals) => new Raw(strings.reduce((out, s, i) => {
  let v = vals[i - 1];
  if (Array.isArray(v)) v = v.map(x => (x instanceof Raw ? x.s : esc(x))).join('');
  else if (v instanceof Raw) v = v.s; else v = esc(v);
  return out + v + s;
}));
const $ = (sel, el = document) => el.querySelector(sel);
const fmtData = d => (d ? d.slice(0, 10).split('-').reverse().join('/') : '–');
const fmtDataHora = d => new Date(d).toLocaleString('pt-BR');
const hojeISO = () => new Date().toISOString().slice(0, 10);

const STATUS = { aberta: 'Aberta', em_andamento: 'Em andamento', aguardando_terceiros: 'Aguardando terceiros', concluida: 'Concluída', cancelada: 'Cancelada' };
const PRAZO = { no_prazo: 'No prazo', breve: 'Vence em breve', fora: 'Fora do prazo', concluida: 'Concluída', cancelada: 'Cancelada' };
const PRIOR = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const ORIGEM = { escola: 'Escola', servidor: 'Servidor', mp: 'Ministério Público', tce: 'TCE', ouvidoria: 'Ouvidoria', outra_unidade: 'Outra unidade' };
const PERFIL = { superintendente: 'Superintendente / Gabinete', admin: 'Administrador', diretor: 'Diretor / Coordenador de unidade', coord_setor: 'Coordenador de setor' };
const TIPO_ACOMP = { andamento: 'Andamento', contato: 'Contato feito', despacho: 'Despacho', reuniao: 'Reunião', comentario: 'Comentário' };
const attr = (cond, s) => (cond ? new Raw(s) : '');
const tagPrazo = s => html`<span class="tag t-${s}">${PRAZO[s] || s}</span>`;

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method: opts.method || 'GET', credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && state.user) { state.user = null; render(); }
  if (!r.ok) { const e = new Error(data.erro || 'Erro inesperado.'); e.data = data; throw e; }
  return data;
}
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4500);
}

const state = { user: null, units: [], sectors: [], tipos: [], alertasNovos: 0 };
const isAdmin = () => state.user.perfil === 'admin';
const podeAlertar = () => ['admin', 'superintendente', 'diretor'].includes(state.user.perfil);
const podeLancar = sid => isAdmin() || (state.user.perfil === 'coord_setor' && state.user.sector_id === Number(sid));

// ---------- tema ----------
function aplicaTema() {
  try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch (_) {}
}
function alternaTema() {
  const escuro = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const novo = escuro ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem('tema', novo); } catch (_) {}
}
aplicaTema();

// ---------- diálogo de formulário genérico ----------
// campos: {name,label,type,required,options,hint,full}
function formDialog({ titulo, campos, valores = {}, enviar, rotuloOk = 'Salvar', extra }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    const campo = c => {
      const v = valores[c.name] ?? c.default ?? '';
      let input;
      if (c.type === 'select') {
        input = html`<select id="f_${c.name}" name="${c.name}" ${c.required ? 'required' : ''}>
          ${(c.vazio ? [html`<option value="">${c.vazio}</option>`] : [])}
          ${c.options.map(([val, lab]) => html`<option value="${val}" ${String(val) === String(v) ? 'selected' : ''}>${lab}</option>`)}</select>`;
      } else if (c.type === 'textarea') {
        input = html`<textarea id="f_${c.name}" name="${c.name}" maxlength="${c.max || 4000}" ${c.required ? 'required' : ''}>${v}</textarea>`;
      } else if (c.type === 'checkbox') {
        return html`<div class="field"><label><input type="checkbox" name="${c.name}" ${v ? 'checked' : ''}> ${c.label}</label></div>`;
      } else {
        input = html`<input id="f_${c.name}" name="${c.name}" type="${c.type || 'text'}" value="${v}" ${c.required ? 'required' : ''}
          ${attr(c.list, `list="${esc(c.list)}"`)} ${attr(c.step, `step="${esc(c.step)}"`)} autocomplete="${c.type === 'password' ? 'new-password' : 'off'}">`;
      }
      return html`<div class="field" style="${c.full ? 'grid-column:1/-1' : ''}"><label for="f_${c.name}" class="${c.required ? 'req' : ''}">${c.label}</label>${input}${c.hint ? html`<div class="hint">${c.hint}</div>` : ''}</div>`;
    };
    dlg.innerHTML = html`<form method="dialog"><h2>${titulo}</h2><div id="fe"></div><div class="grid2">${campos.map(campo)}</div>
      ${extra || ''}<div class="actions"><button type="button" data-x="cancel">Cancelar</button><button class="btn-primary" type="submit">${rotuloOk}</button></div></form>`.s;
    document.body.append(dlg); dlg.showModal();
    const form = $('form', dlg);
    $('[data-x=cancel]', dlg).onclick = () => dlg.close();
    dlg.addEventListener('close', () => { dlg.remove(); resolve(false); });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const dados = {};
      for (const c of campos) {
        const el = form.elements[c.name]; if (!el) continue;
        dados[c.name] = c.type === 'checkbox' ? el.checked : el.value;
      }
      const btn = $('.btn-primary', dlg); btn.disabled = true;
      try { await enviar(dados, form); dlg.close(); toast('Salvo com sucesso.'); resolve(true); render(); }
      catch (e) { $('#fe', dlg).innerHTML = html`<div class="error" role="alert">${e.message}</div>`.s; btn.disabled = false; }
    });
  });
}
const confirmar = msg => new Promise(res => {
  const d = document.createElement('dialog');
  d.innerHTML = html`<form method="dialog"><p>${msg}</p><div class="actions"><button value="n">Cancelar</button><button class="btn-primary" value="s">Confirmar</button></div></form>`.s;
  document.body.append(d); d.showModal(); d.addEventListener('close', () => { res(d.returnValue === 's'); d.remove(); });
});

// ---------- componentes ----------
const skeleton = () => html`<div class="grid g-kpi">${[1, 2, 3, 4, 5].map(() => html`<div class="skel"></div>`)}</div><div class="skel mt" style="height:260px"></div>`;
const vazio = (t, d) => html`<div class="empty"><b>${t}</b>${d || ''}</div>`;

function kpis(k, base = '') {
  const item = (cls, n, rot, filtro) => html`<a class="card kpi ${cls}" href="#/lista?${base}${filtro}"><b>${n}</b><span>${rot}</span></a>`;
  return html`<div class="grid g-kpi" role="list">
    ${item('', k.total, 'Total de demandas', '')}
    ${item('ok', k.no_prazo + k.vence_em_breve, `No prazo (${k.vence_em_breve} vencem em breve)`, '&prazo_status=no_prazo')}
    ${item('bad', k.fora_do_prazo, 'Fora do prazo', '&prazo_status=fora')}
    ${item('done', k.concluidas, 'Concluídas', '&prazo_status=concluida')}
    ${item('', k.pendentes, 'Pendentes (em aberto)', '&aberta=1')}</div>`;
}

function barrasEmpilhadas(unidades) {
  const seg = (n, tot, cls) => (tot ? html`<i class="s-${cls}" style="width:${100 * n / tot}%" title="${PRAZO[cls]}: ${n}"></i>` : '');
  return html`${unidades.map(u => html`<div class="hbar" style="grid-template-columns:100px 1fr 44px"><span class="lbl">${u.sigla}</span>
      <div class="bar" role="img" aria-label="${u.sigla}: ${u.no_prazo} no prazo, ${u.vence_em_breve} vencem em breve, ${u.fora_do_prazo} fora do prazo, ${u.concluidas} concluídas">
      ${seg(u.no_prazo, u.total, 'no_prazo')}${seg(u.vence_em_breve, u.total, 'breve')}${seg(u.fora_do_prazo, u.total, 'fora')}${seg(u.concluidas, u.total, 'concluida')}</div>
      <b>${u.total}</b></div>`)}
    <div class="legend">${['no_prazo', 'breve', 'fora', 'concluida'].map(c => html`<span><i class="s-${c}"></i>${PRAZO[c]}</span>`)}</div>`;
}

function linhas(evolucao) {
  const W = 560, H = 220, p = { l: 34, r: 10, t: 10, b: 26 };
  const max = Math.max(5, ...evolucao.flatMap(e => [e.recebidas, e.concluidas]));
  const x = i => p.l + (i * (W - p.l - p.r)) / Math.max(1, evolucao.length - 1);
  const y = v => H - p.b - (v * (H - p.t - p.b)) / max;
  const path = k => evolucao.map((e, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(e[k]).toFixed(1)}`).join(' ');
  const grade = [0, .25, .5, .75, 1].map(f => Math.round(max * f));
  return html`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução mensal de demandas recebidas e concluídas">
    ${grade.map(g => html`<line x1="${p.l}" x2="${W - p.r}" y1="${y(g)}" y2="${y(g)}" stroke="var(--border)"/><text x="${p.l - 6}" y="${y(g) + 4}" text-anchor="end">${g}</text>`)}
    ${evolucao.map((e, i) => (i % 2 === 0 ? html`<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${e.mes.slice(5)}/${e.mes.slice(2, 4)}</text>` : ''))}
    <path d="${path('recebidas')}" fill="none" stroke="var(--primary-2)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${path('concluidas')}" fill="none" stroke="var(--done)" stroke-width="2.5" stroke-dasharray="5 4" stroke-linejoin="round"/>
    ${evolucao.map((e, i) => html`<circle cx="${x(i)}" cy="${y(e.recebidas)}" r="3" fill="var(--primary-2)"><title>${e.mes}: ${e.recebidas} recebidas</title></circle>
      <circle cx="${x(i)}" cy="${y(e.concluidas)}" r="3" fill="var(--done)"><title>${e.mes}: ${e.concluidas} concluídas</title></circle>`)}</svg>
    <div class="legend"><span><i style="background:var(--primary-2)"></i>Recebidas</span><span><i style="background:var(--done)"></i>Concluídas (tracejado)</span></div></div>`;
}

function ranking(lista) {
  if (!lista.length) return vazio('Nenhum setor com atraso', 'Ótimo sinal: não há demandas fora do prazo.');
  const max = Math.max(...lista.map(r => r.fora_do_prazo));
  return html`${lista.map(r => html`<a class="hbar" style="grid-template-columns:minmax(120px,1.2fr) 2fr 36px;text-decoration:none;color:inherit" href="#/setor/${r.id}">
    <span class="lbl" title="${r.setor}">${r.setor} <span class="muted small">${r.unidade}</span></span>
    <div class="bar"><i class="s-fora" style="width:${100 * r.fora_do_prazo / max}%"></i></div><b>${r.fora_do_prazo}</b></a>`)}`;
}

function mapaCalor(linhasCalor) {
  if (!linhasCalor.length) return vazio('Sem atrasos nas últimas semanas');
  const semanas = [...new Set(linhasCalor.map(l => l.semana))];
  const setores = [...new Set(linhasCalor.map(l => l.setor))];
  const max = Math.max(1, ...linhasCalor.map(l => l.qtd));
  const val = (s, w) => linhasCalor.find(l => l.setor === s && l.semana === w)?.qtd || 0;
  return html`<div class="tablewrap"><table class="heat" aria-label="Mapa de calor de atrasos por setor e semana"><thead><tr><th></th>${semanas.map(w => html`<th>${w}</th>`)}</tr></thead>
    <tbody>${setores.map(s => html`<tr><td class="name" title="${s}">${s}</td>${semanas.map(w => {
      const v = val(s, w); const a = v ? 0.15 + 0.85 * v / max : 0;
      return html`<td style="background:${v ? `rgba(185,28,28,${a.toFixed(2)})` : 'var(--surface-2)'};color:${a > .55 ? '#fff' : 'var(--text)'}" title="${s} – semana de ${w}: ${v} em atraso">${v || ''}</td>`;
    })}</tr>`)}</tbody></table></div><div class="hint">Demandas em atraso, agrupadas pela semana do prazo (8 últimas semanas).</div>`;
}

function cartoesUnidades(lista) {
  return html`<div class="grid g-units">${lista.map(u => html`<a class="card unit" href="#/unidade/${u.id}">
    <div class="row between"><b>${u.sigla}</b><span class="row small" style="gap:6px"><span class="dot ${u.semaforo}" aria-hidden="true"></span>${{ verde: 'Em dia', amarelo: 'Atenção', vermelho: 'Crítico', cinza: 'Sem dados' }[u.semaforo]}</span></div>
    <div class="big">${u.pct_no_prazo == null ? '–' : u.pct_no_prazo + '%'} <span class="muted small">no prazo</span></div>
    <div class="small">${u.fora_do_prazo} fora do prazo · ${u.total} demandas</div>
    <div class="small trend ${u.tendencia > 0 ? 'up' : u.tendencia < 0 ? 'down' : 'muted'}">${u.tendencia == null ? 'Tendência: sem base de comparação' : (u.tendencia > 0 ? '▲ +' : u.tendencia < 0 ? '▼ ' : '● ') + u.tendencia + ' p.p. vs. 30 dias anteriores'}</div></a>`)}</div>`;
}

function tabelaDemandas(lista, { mostraSetor = true } = {}) {
  if (!lista.length) return vazio('Nenhuma demanda encontrada', 'Ajuste os filtros ou lance uma nova demanda.');
  return html`<div class="tablewrap"><table><thead><tr><th>Processo</th><th>Assunto</th>${mostraSetor ? html`<th>Setor</th>` : ''}<th>Prazo</th><th>Situação</th><th>Prioridade</th><th>Responsável</th></tr></thead><tbody>
    ${lista.map(d => html`<tr><td><a href="#/demanda/${d.id}">${d.processo}</a></td><td>${d.assunto}</td>
      ${mostraSetor ? html`<td>${d.unidade} · ${d.setor}</td>` : ''}
      <td>${fmtData(d.prazo)}${d.prazo_status === 'fora' ? html` <span class="small muted">(${-d.dias_para_vencer}d de atraso)</span>` : ''}</td>
      <td>${tagPrazo(d.prazo_status)}<div class="small muted">${STATUS[d.status]}</div></td><td>${PRIOR[d.prioridade]}</td><td>${d.responsavel || '–'}</td></tr>`)}</tbody></table></div>`;
}

// ---------- páginas ----------
async function paginaGeral(params, escopo = {}) {
  const qs = new URLSearchParams(escopo).toString();
  const [r, prox] = await Promise.all([api('/dashboard/resumo?' + qs), api('/dashboard/proximos?' + qs)]);
  const unidade = escopo.unit_id ? state.units.find(u => u.id === Number(escopo.unit_id)) : null;
  const base = qs ? qs + '&' : '';
  return html`
    ${kpis(r.kpis, base)}
    ${!escopo.unit_id && !escopo.sector_id ? html`<h2 class="mt">Unidades</h2>${cartoesUnidades(r.porUnidade)}` : ''}
    <div class="grid g-2 mt">
      <section class="card"><h2>Demandas por ${escopo.unit_id ? 'unidade' : 'unidade'} e situação</h2>${barrasEmpilhadas(r.porUnidade)}</section>
      <section class="card"><h2>Evolução mensal</h2>${linhas(r.evolucao)}</section>
      <section class="card"><h2>Setores com mais atrasos</h2>${ranking(r.ranking)}</section>
      <section class="card"><h2>Mapa de calor: setor × semana</h2>${mapaCalor(r.calor)}</section>
    </div>
    <section class="card mt"><h2>Vencimentos e atrasos (próximos 7 dias)</h2>${prox.length ? html`<div class="tablewrap"><table><thead><tr><th>Processo</th><th>Assunto</th><th>Setor</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>
      ${prox.map(d => html`<tr><td><a href="#/demanda/${d.id}">${d.processo}</a></td><td>${d.assunto}</td><td>${d.unidade} · ${d.setor}</td><td>${fmtData(d.prazo)}</td><td>${tagPrazo(d.prazo_status)}</td></tr>`)}</tbody></table></div>` : vazio('Nada vencendo nos próximos dias')}</section>`;
}

async function viewGeral() {
  const u = state.user;
  if (u.perfil === 'coord_setor') return go(`#/setor/${u.sector_id}`);
  if (u.perfil === 'diretor') return go(`#/unidade/${u.unit_id}`);
  return { titulo: 'Visão Geral', sub: 'Superintendência Regional de Ensino Metropolitana A', corpo: await paginaGeral() };
}

async function viewUnidade(id) {
  const un = state.units.find(x => x.id === Number(id));
  if (!un) return { titulo: 'Unidade não encontrada', corpo: vazio('Unidade não encontrada ou sem acesso.') };
  const setores = state.sectors.filter(s => s.unit_id === un.id);
  const [corpo, r] = await Promise.all([paginaGeral({}, { unit_id: un.id }), api('/dashboard/resumo?unit_id=' + un.id)]);
  const lista = html`<section class="card mt"><h2>Setores</h2><div class="tablewrap"><table><thead><tr><th>Setor</th><th>Ramal</th><th></th></tr></thead><tbody>
    ${setores.map(s => html`<tr><td><a href="#/setor/${s.id}">${s.nome}</a></td><td>${s.ramais.join(' / ') || '–'}</td><td><a class="btn btn-sm" href="#/setor/${s.id}">Abrir</a></td></tr>`)}</tbody></table></div></section>`;
  return { titulo: `${un.sigla} – ${un.nome}`, crumbs: [['#/', 'Visão Geral'], [null, un.sigla]], corpo: html`${corpo}${lista}`,
    acoes: podeAlertar() ? html`<button data-act="alerta" data-unit="${un.id}">Enviar alerta à unidade</button>` : '' };
}

function abasSetor(id, ativa) {
  const abas = [['demandas', 'Demandas'], ['pendencias', 'Pendências'], ['consolidado', 'Consolidado'], ['indicadores', 'Indicadores']];
  return html`<nav class="tabs" aria-label="Seções do setor">${abas.map(([k, l]) => html`<a href="#/setor/${id}/${k}" ${attr(k === ativa, 'aria-current="page"')}>${l}</a>`)}</nav>`;
}

async function viewSetor(id, aba = 'demandas') {
  const s = state.sectors.find(x => x.id === Number(id));
  if (!s) return { titulo: 'Setor não encontrado', corpo: vazio('Setor não encontrado ou sem acesso.') };
  const un = state.units.find(u => u.id === s.unit_id);
  const pode = podeLancar(s.id);
  let corpo, acoes = '';
  if (aba === 'demandas') {
    const [r, lista] = await Promise.all([api('/dashboard/resumo?sector_id=' + s.id), api('/demandas?sector_id=' + s.id + '&limit=500')]);
    corpo = html`${kpis(r.kpis, 'sector_id=' + s.id + '&')}<div class="card mt">${tabelaDemandas(lista, { mostraSetor: false })}</div>`;
    if (pode) acoes = html`<button class="btn-primary" data-act="nova-demanda" data-sector="${s.id}">+ Nova demanda</button><button data-act="importar" data-sector="${s.id}">Importar CSV</button>`;
  } else if (aba === 'pendencias') {
    const lista = await api('/pendencias?sector_id=' + s.id);
    corpo = html`<div class="card">${lista.length ? html`<div class="tablewrap"><table><thead><tr><th>Descrição</th><th>Motivo</th><th>Responsável</th><th>Prazo</th><th>Demanda</th><th></th></tr></thead><tbody>
      ${lista.map(p => html`<tr><td>${p.descricao}</td><td>${p.motivo || '–'}</td><td>${p.responsavel || '–'}</td>
        <td>${fmtData(p.prazo)} ${p.resolvida ? html`<span class="tag t-concluida">Resolvida</span>` : p.atrasada ? html`<span class="tag t-fora">Atrasada</span>` : ''}</td>
        <td>${p.processo || '–'}</td><td class="no-print">${pode ? html`<button class="btn-sm" data-act="res-pend" data-id="${p.id}" data-v="${p.resolvida ? 0 : 1}">${p.resolvida ? 'Reabrir' : 'Resolver'}</button>
        <button class="btn-sm btn-danger" data-act="del-pend" data-id="${p.id}">Excluir</button>` : ''}</td></tr>`)}</tbody></table></div>` : vazio('Nenhuma pendência registrada', 'Registre o que falta para destravar uma demanda.')}</div>`;
    if (pode) acoes = html`<button class="btn-primary" data-act="nova-pend" data-sector="${s.id}">+ Nova pendência</button>`;
  } else if (aba === 'consolidado') {
    const lista = await api('/consolidados?sector_id=' + s.id);
    corpo = html`<div class="card">${lista.length ? html`<div class="tablewrap"><table><thead><tr><th>Período</th><th>Recebidas</th><th>Concluídas</th><th>Em aberto</th><th>Tempo médio (dias)</th><th>Observações</th></tr></thead><tbody>
      ${lista.map(c => html`<tr><td>${fmtData(c.periodo_inicio)} a ${fmtData(c.periodo_fim)}</td><td>${c.recebidas}</td><td>${c.concluidas}</td><td>${c.em_aberto}</td><td>${c.tempo_medio_dias ?? '–'}</td><td>${c.observacoes || ''}</td></tr>`)}</tbody></table></div>` : vazio('Nenhum consolidado lançado')}</div>`;
    if (pode) acoes = html`<button class="btn-primary" data-act="novo-cons" data-sector="${s.id}">+ Lançar consolidado</button>`;
  } else {
    const lista = await api('/indicadores?sector_id=' + s.id);
    const atingido = i => (i.realizado == null ? null : i.menor_melhor ? i.realizado <= i.meta : i.realizado >= i.meta);
    const un = { pct: '%', num: '', dias: ' dias' };
    corpo = html`<div class="grid g-units">${lista.map(i => { const ok = atingido(i); return html`<div class="card"><div class="small muted">${i.periodicidade}</div><b>${i.nome}</b>
      <div class="big" style="font-size:1.7rem;font-weight:700">${i.realizado ?? '–'}${i.realizado != null ? un[i.unidade] : ''}</div>
      <div class="small">Meta: ${i.menor_melhor ? '≤ ' : '≥ '}${i.meta}${un[i.unidade]}</div>
      ${ok == null ? html`<span class="tag t-pend">Sem lançamento</span>` : ok ? html`<span class="tag t-no_prazo">Meta atingida</span>` : html`<span class="tag t-fora">Abaixo da meta</span>`}
      ${pode ? html`<div class="row" style="margin-top:10px"><button class="btn-sm" data-act="edit-ind" data-id="${i.id}">Atualizar</button><button class="btn-sm btn-danger" data-act="del-ind" data-id="${i.id}">Excluir</button></div>` : ''}</div>`; })}</div>
      ${lista.length ? '' : html`<div class="card">${vazio('Nenhum indicador cadastrado', 'Use um dos modelos prontos para começar.')}</div>`}`;
    if (pode) acoes = html`<button class="btn-primary" data-act="novo-ind" data-sector="${s.id}">+ Novo indicador</button>`;
  }
  const contato = html`<div class="small muted">Ramal: ${s.ramais.join(' / ') || '–'} · Sala: ${s.sala || '–'} · ${s.emails.length ? s.emails.map(e => html`<a href="mailto:${e}">${e}</a>`) : 'sem e-mail'}</div>`;
  state.sectorCache = { ...state.sectorCache, [s.id]: s };
  return { titulo: s.nome, sub: contato, crumbs: [['#/', 'Visão Geral'], [`#/unidade/${un.id}`, un.sigla], [null, s.nome]],
    corpo: html`${abasSetor(s.id, aba)}${corpo}`, acoes: html`${acoes}${podeAlertar() ? html`<button data-act="alerta" data-sector="${s.id}">Enviar alerta</button>` : ''}` };
}

async function viewLista(params) {
  const sp = new URLSearchParams(params);
  const filtros = {}; for (const k of ['prazo_status', 'unit_id', 'sector_id', 'status', 'prioridade', 'q']) if (sp.get(k)) filtros[k] = sp.get(k);
  let lista = await api('/demandas?limit=1000&' + new URLSearchParams(filtros));
  if (sp.get('aberta')) lista = lista.filter(d => !['concluida', 'cancelada'].includes(d.status));
  const titulos = { fora: 'Demandas fora do prazo', no_prazo: 'Demandas no prazo', concluida: 'Demandas concluídas' };
  const form = html`<form class="row no-print" data-form="filtros" style="margin-bottom:14px">
    <select name="prazo_status" aria-label="Situação do prazo"><option value="">Todos os prazos</option>${Object.entries(PRAZO).map(([k, v]) => html`<option value="${k}" ${filtros.prazo_status === k ? 'selected' : ''}>${v}</option>`)}</select>
    <select name="unit_id" aria-label="Unidade"><option value="">Todas as unidades</option>${state.units.map(u => html`<option value="${u.id}" ${filtros.unit_id == u.id ? 'selected' : ''}>${u.sigla}</option>`)}</select>
    <input name="q" placeholder="Processo, assunto, responsável" value="${filtros.q || ''}" aria-label="Busca"><button class="btn-primary">Filtrar</button></form>`;
  return { titulo: titulos[filtros.prazo_status] || (sp.get('aberta') ? 'Demandas pendentes' : 'Demandas'), sub: `${lista.length} resultado(s)`,
    crumbs: [['#/', 'Visão Geral'], [null, 'Demandas']], corpo: html`${form}<div class="card">${tabelaDemandas(lista)}</div>` };
}

async function viewDemanda(id) {
  const [d, ac, aud] = await Promise.all([api('/demandas/' + id), api(`/demandas/${id}/acompanhamentos`),
    ['admin', 'superintendente'].includes(state.user.perfil) ? api(`/auditoria?entidade=demandas&entidade_id=${id}`) : []]);
  const pode = podeLancar(d.sector_id);
  const podeComentar = pode || state.user.perfil === 'diretor' || state.user.perfil === 'superintendente';
  const campo = (l, v) => html`<div><div class="small muted">${l}</div>${v}</div>`;
  return { titulo: d.processo, sub: d.assunto, crumbs: [['#/', 'Visão Geral'], [`#/setor/${d.sector_id}`, d.setor], [null, d.processo]],
    acoes: html`${pode ? html`<button data-act="edit-demanda" data-id="${d.id}">Editar</button><button class="btn-danger" data-act="del-demanda" data-id="${d.id}" data-sector="${d.sector_id}">Excluir</button>` : ''}${podeAlertar() ? html`<button data-act="alerta" data-sector="${d.sector_id}" data-demanda="${d.id}">Cobrar</button>` : ''}`,
    corpo: html`<div class="grid g-2"><section class="card"><h2>Dados</h2><div class="grid2" style="gap:12px 14px">
      ${campo('Situação do prazo', tagPrazo(d.prazo_status))}${campo('Status', STATUS[d.status])}${campo('Setor', `${d.unidade} · ${d.setor}`)}
      ${campo('Tipo', d.tipo || '–')}${campo('Origem', ORIGEM[d.origem])}${campo('Prioridade', PRIOR[d.prioridade])}
      ${campo('Entrada', fmtData(d.data_entrada))}${campo('Prazo', fmtData(d.prazo))}${campo('Conclusão', fmtData(d.data_conclusao))}
      ${campo('Responsável', d.responsavel || '–')}</div>${d.observacoes ? html`<h3 class="mt">Observações</h3><p>${d.observacoes}</p>` : ''}</section>
      <section class="card"><div class="row between"><h2>Linha do tempo</h2>${podeComentar ? html`<button class="btn-sm" data-act="novo-acomp" data-id="${d.id}">+ Registro</button>` : ''}</div>
      ${ac.length ? html`<div class="timeline">${ac.map(a => html`<div class="it"><b>${TIPO_ACOMP[a.tipo]}</b> <span class="muted small">${fmtData(a.data)} · ${a.autor || '—'}</span><div>${a.texto}</div></div>`)}</div>` : vazio('Sem registros', 'Registre contatos, despachos e andamentos.')}</section></div>
      ${aud.length ? html`<section class="card mt"><h2>Trilha de auditoria</h2><div class="tablewrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th></tr></thead><tbody>${aud.map(a => html`<tr><td>${fmtDataHora(a.em)}</td><td>${a.user_email || '—'}</td><td>${a.acao}</td></tr>`)}</tbody></table></div></section>` : ''}` };
}

async function viewAlertas() {
  const lista = await api('/alertas');
  return { titulo: 'Alertas', sub: 'Mensagens de cobrança e avisos', acoes: podeAlertar() ? html`<button class="btn-primary" data-act="alerta">+ Novo alerta</button>` : '',
    corpo: lista.length ? html`<div class="grid">${lista.map(a => html`<div class="card alert-it ${a.lido_em ? 'lido' : ''}"><div class="row between"><b>${a.setor ? `${a.unidade} · ${a.setor}` : a.unidade || 'Todos os setores'}</b>
      <span class="small muted">${fmtDataHora(a.created_at)} · de ${a.de}</span></div><p>${a.mensagem}</p>
      ${a.processo ? html`<div class="small">Processo: <a href="#/demanda/${a.demanda_id}">${a.processo}</a></div>` : ''}
      ${a.lido_em ? '' : html`<button class="btn-sm" data-act="lido" data-id="${a.id}">Marcar como lido</button>`}</div>`)}</div>` : html`<div class="card">${vazio('Nenhum alerta', 'Quando houver cobranças, elas aparecem aqui.')}</div>` };
}

async function viewContatos(params) {
  const q = new URLSearchParams(params).get('q') || '';
  const lista = await api('/contatos?q=' + encodeURIComponent(q));
  const podeEditar = s => isAdmin() || (state.user.perfil === 'coord_setor' && state.user.sector_id === s.id);
  return { titulo: 'Contatos e ramais', crumbs: [['#/', 'Visão Geral'], [null, 'Contatos']],
    corpo: html`<form class="row no-print" data-form="contatos" style="margin-bottom:14px"><input name="q" value="${q}" placeholder="Setor, ramal, sala, e-mail" aria-label="Buscar contatos" style="min-width:260px"><button class="btn-primary">Buscar</button></form>
    <div class="card">${lista.length ? html`<div class="tablewrap"><table><thead><tr><th>Unidade</th><th>Setor</th><th>Ramal</th><th>Telefone</th><th>Sala</th><th>E-mails</th><th></th></tr></thead><tbody>
    ${lista.map(s => html`<tr><td>${s.unidade}</td><td>${s.nome}</td><td>${s.ramais.join(' / ') || '–'}</td><td>${s.telefones.join(' / ') || '–'}</td><td>${s.sala || '–'}</td>
      <td>${s.emails.length ? s.emails.map(e => html`<div><a href="mailto:${e}">${e}</a></div>`) : '–'}</td><td class="no-print">${podeEditar(s) ? html`<button class="btn-sm" data-act="edit-setor" data-id="${s.id}">Editar</button>` : ''}</td></tr>`)}</tbody></table></div>` : vazio('Nenhum contato encontrado')}</div>`,
    acoes: isAdmin() ? html`<button data-act="novo-setor">+ Novo setor</button>` : '' };
}

async function viewRelatorios() {
  return { titulo: 'Relatórios', crumbs: [['#/', 'Visão Geral'], [null, 'Relatórios']], corpo: html`<div class="grid g-units">
    <div class="card"><h2>Demandas (CSV)</h2><p class="muted small">Todas as demandas que você pode ver, com situação do prazo calculada.</p><button class="btn-primary" data-act="csv-demandas">Baixar CSV</button></div>
    <div class="card"><h2>Fora do prazo (CSV)</h2><p class="muted small">Somente demandas vencidas e não concluídas.</p><button class="btn-primary" data-act="csv-fora">Baixar CSV</button></div>
    <div class="card"><h2>Visão geral (PDF)</h2><p class="muted small">Abre a impressão do navegador; escolha “Salvar como PDF”.</p><button data-act="imprimir">Imprimir / PDF</button></div></div>` };
}

async function viewAdmin() {
  if (!isAdmin() && state.user.perfil !== 'superintendente') return { titulo: 'Administração', corpo: vazio('Sem permissão') };
  const [usuarios, cfg, aud] = await Promise.all([api('/usuarios'), api('/config'), api('/auditoria')]);
  return { titulo: 'Administração', crumbs: [['#/', 'Visão Geral'], [null, 'Administração']], acoes: isAdmin() ? html`<button class="btn-primary" data-act="novo-user">+ Novo usuário</button>` : '',
    corpo: html`<section class="card"><h2>Usuários</h2><div class="tablewrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Lotação</th><th>Ativo</th><th></th></tr></thead><tbody>
    ${usuarios.map(u => html`<tr><td>${u.nome}</td><td>${u.email}</td><td>${PERFIL[u.perfil]}</td><td>${u.setor || u.unidade || '–'}</td><td>${u.ativo ? 'Sim' : 'Não'}</td>
      <td>${isAdmin() ? html`<button class="btn-sm" data-act="edit-user" data-id="${u.id}">Editar</button>` : ''}</td></tr>`)}</tbody></table></div></section>
    ${isAdmin() ? html`<section class="card mt"><h2>Parâmetros</h2><p>Dias para “vence em breve”: <b>${cfg.dias_vence_em_breve}</b> · Periodicidade do consolidado: <b>${cfg.periodicidade_consolidado}</b></p>
    <button data-act="config">Alterar</button> <button data-act="novo-tipo">+ Tipo de demanda</button></section>` : ''}
    <section class="card mt"><h2>Trilha de auditoria (últimos 300)</h2><div class="tablewrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th></tr></thead><tbody>
    ${aud.map(a => html`<tr><td>${fmtDataHora(a.em)}</td><td>${a.user_email || '—'}</td><td>${a.acao}</td><td>${a.entidade} #${a.entidade_id ?? ''}</td></tr>`)}</tbody></table></div></section>`,
    usuarios };
}

// ---------- ações (formulários) ----------
const opts = arr => arr.map(x => [x.id, x.nome]);
const mapa = o => Object.entries(o);
async function campoSetor(valorId) {
  return { name: 'sector_id', label: 'Setor', type: 'select', required: true, options: state.sectors.map(s => [s.id, `${s.unidade} · ${s.nome}`]), default: valorId };
}

const acoes = {
  async 'nova-demanda'(el, d) {
    const sid = d.sector;
    await formDialog({ titulo: 'Nova demanda', enviar: x => api('/demandas', { method: 'POST', body: { ...x, sector_id: Number(sid) } }),
      campos: camposDemanda(), valores: { data_entrada: hojeISO() } });
  },
  async 'edit-demanda'(el, d) {
    const dem = await api('/demandas/' + d.id);
    await formDialog({ titulo: 'Editar demanda', enviar: x => api('/demandas/' + d.id, { method: 'PUT', body: x }), campos: camposDemanda(), valores: dem });
  },
  async 'del-demanda'(el, d) {
    if (await confirmar('Excluir esta demanda e seu histórico? A exclusão fica registrada na auditoria.')) {
      await api('/demandas/' + d.id, { method: 'DELETE' }); toast('Demanda excluída.'); go('#/setor/' + d.sector);
    }
  },
  async 'novo-acomp'(el, d) {
    await formDialog({ titulo: 'Novo registro na linha do tempo', rotuloOk: 'Registrar', enviar: x => api(`/demandas/${d.id}/acompanhamentos`, { method: 'POST', body: x }),
      valores: { data: hojeISO() }, campos: [
        { name: 'data', label: 'Data', type: 'date', required: true }, { name: 'tipo', label: 'Tipo', type: 'select', options: mapa(TIPO_ACOMP) },
        { name: 'texto', label: 'Registro', type: 'textarea', required: true, full: true }] });
  },
  async 'nova-pend'(el, d) {
    const dems = await api('/demandas?sector_id=' + d.sector + '&limit=500');
    await formDialog({ titulo: 'Nova pendência', enviar: x => api('/pendencias', { method: 'POST', body: { ...x, sector_id: Number(d.sector) } }), campos: [
      { name: 'descricao', label: 'O que falta', type: 'textarea', required: true, full: true }, { name: 'motivo', label: 'Motivo / impedimento', full: true },
      { name: 'responsavel', label: 'Responsável' }, { name: 'prazo', label: 'Prazo para resolução', type: 'date' },
      { name: 'demanda_id', label: 'Vincular à demanda', type: 'select', vazio: '— nenhuma —', options: dems.map(x => [x.id, `${x.processo} – ${x.assunto}`.slice(0, 80)]), full: true }] });
  },
  async 'res-pend'(el, d) { await api('/pendencias/' + d.id, { method: 'PUT', body: { resolvida: d.v === '1' } }); render(); },
  async 'del-pend'(el, d) { if (await confirmar('Excluir esta pendência?')) { await api('/pendencias/' + d.id, { method: 'DELETE' }); render(); } },
  async 'novo-cons'(el, d) {
    const cfg = { mensal: 1 };
    const ini = new Date(); ini.setDate(1); const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
    const iso = x => new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    await formDialog({ titulo: 'Consolidado do período', enviar: x => api('/consolidados', { method: 'POST', body: { ...x, sector_id: Number(d.sector) } }),
      valores: { periodo_inicio: iso(ini), periodo_fim: iso(fim) }, campos: [
        { name: 'periodo_inicio', label: 'Início', type: 'date', required: true }, { name: 'periodo_fim', label: 'Fim', type: 'date', required: true },
        { name: 'recebidas', label: 'Recebidas', type: 'number', required: true, default: 0 }, { name: 'concluidas', label: 'Concluídas', type: 'number', required: true, default: 0 },
        { name: 'em_aberto', label: 'Em aberto', type: 'number', required: true, default: 0 }, { name: 'tempo_medio_dias', label: 'Tempo médio de atendimento (dias)', type: 'number', step: '0.1' },
        { name: 'observacoes', label: 'Observações do coordenador', type: 'textarea', full: true }],
      extra: html`<div class="hint">Dica: <a href="#" data-sugerir="${d.sector}">preencher totais a partir das demandas lançadas</a> (você pode ajustar).</div>` });
  },
  async 'novo-ind'(el, d) {
    const modelos = await api('/modelos-indicador');
    window._modelos = modelos;
    await formDialog({ titulo: 'Novo indicador', enviar: x => api('/indicadores', { method: 'POST', body: { ...x, sector_id: Number(d.sector) } }),
      extra: html`<div class="field"><label for="modelo">Começar de um modelo</label><select id="modelo" data-modelo><option value="">— escolher —</option>${modelos.map((m, i) => html`<option value="${i}">${m.nome}</option>`)}</select></div>`,
      campos: [{ name: 'nome', label: 'Nome', required: true, full: true }, { name: 'meta', label: 'Meta', type: 'number', step: 'any', required: true },
        { name: 'realizado', label: 'Realizado', type: 'number', step: 'any' }, { name: 'unidade', label: 'Unidade', type: 'select', options: [['pct', '%'], ['num', 'Nº'], ['dias', 'Dias']] },
        { name: 'periodicidade', label: 'Periodicidade', type: 'select', options: [['quinzenal', 'Quinzenal'], ['mensal', 'Mensal'], ['trimestral', 'Trimestral'], ['anual', 'Anual']], default: 'mensal' },
        { name: 'menor_melhor', label: 'Quanto menor, melhor (ex.: tempo de resposta)', type: 'checkbox' }] });
  },
  async 'edit-ind'(el, d) {
    const lista = await api('/indicadores'); const i = lista.find(x => x.id === Number(d.id));
    await formDialog({ titulo: 'Atualizar indicador', enviar: x => api('/indicadores/' + d.id, { method: 'PUT', body: x }), valores: i, campos: [
      { name: 'nome', label: 'Nome', required: true, full: true }, { name: 'meta', label: 'Meta', type: 'number', step: 'any', required: true },
      { name: 'realizado', label: 'Realizado', type: 'number', step: 'any' }, { name: 'unidade', label: 'Unidade', type: 'select', options: [['pct', '%'], ['num', 'Nº'], ['dias', 'Dias']] },
      { name: 'periodicidade', label: 'Periodicidade', type: 'select', options: [['quinzenal', 'Quinzenal'], ['mensal', 'Mensal'], ['trimestral', 'Trimestral'], ['anual', 'Anual']] },
      { name: 'menor_melhor', label: 'Quanto menor, melhor', type: 'checkbox' }] });
  },
  async 'del-ind'(el, d) { if (await confirmar('Excluir este indicador?')) { await api('/indicadores/' + d.id, { method: 'DELETE' }); render(); } },
  async importar(el, d) {
    await formDialog({ titulo: 'Importar demandas (CSV)', rotuloOk: 'Importar', campos: [{ name: 'arquivo', label: 'Arquivo CSV', type: 'file', required: true, full: true,
      hint: 'Use o modelo (separador vírgula ou ponto e vírgula; datas aaaa-mm-dd ou dd/mm/aaaa).' }],
      extra: html`<p><a href="/api/modelo-demandas.csv">Baixar modelo CSV</a></p>`,
      enviar: async (_x, form) => {
        const f = form.elements.arquivo.files[0]; if (!f) throw new Error('Escolha um arquivo.');
        const linhas = parseCsv(await f.text());
        try { await api('/demandas/importar', { method: 'POST', body: { sector_id: Number(d.sector), linhas } }); }
        catch (e) { throw new Error(e.data?.erros ? e.message + ' ' + e.data.erros.slice(0, 5).map(x => `Linha ${x.linha}: ${x.erro}`).join(' | ') : e.message); }
      } });
  },
  async alerta(el, d) {
    const setoresOpc = state.sectors.map(s => [s.id, `${s.unidade} · ${s.nome}`]);
    await formDialog({ titulo: 'Enviar alerta', rotuloOk: 'Enviar', enviar: x => api('/alertas', { method: 'POST', body: { ...x, demanda_id: d.demanda ? Number(d.demanda) : null } }),
      valores: { sector_id: d.sector || '', unit_id: d.unit || '' }, campos: [
        ...(state.user.perfil === 'diretor' ? [] : [{ name: 'unit_id', label: 'Unidade (todos os setores)', type: 'select', vazio: '— toda a SRE —', options: state.units.map(u => [u.id, u.sigla]) }]),
        { name: 'sector_id', label: 'Ou um setor específico', type: 'select', vazio: '— todos da unidade —', options: setoresOpc },
        { name: 'mensagem', label: 'Mensagem', type: 'textarea', required: true, full: true, max: 1000 }] });
  },
  async lido(el, d) { await api(`/alertas/${d.id}/lido`, { method: 'POST', body: {} }); await carregaAlertas(); render(); },
  async 'edit-setor'(el, d) {
    const s = (await api('/contatos')).find(x => x.id === Number(d.id));
    await formDialog({ titulo: 'Editar contato do setor', valores: { ...s, ramais: s.ramais.join(' / '), telefones: s.telefones.join(' / '), emails: s.emails.join(', ') },
      enviar: x => api('/setores/' + d.id, { method: 'PUT', body: x }).then(refreshEstrutura), campos: [
        ...(isAdmin() ? [{ name: 'nome', label: 'Nome do setor', required: true, full: true }] : []),
        { name: 'ramais', label: 'Ramais', hint: 'Separe por barra ou vírgula (ex.: 215 / 259)' }, { name: 'telefones', label: 'Telefones' },
        { name: 'sala', label: 'Sala' }, { name: 'emails', label: 'E-mails', hint: 'Separe por vírgula', full: true }] });
  },
  async 'novo-setor'() {
    await formDialog({ titulo: 'Novo setor', enviar: x => api('/setores', { method: 'POST', body: { ...x, unit_id: Number(x.unit_id) } }).then(refreshEstrutura), campos: [
      { name: 'unit_id', label: 'Unidade', type: 'select', required: true, options: state.units.map(u => [u.id, u.sigla]) }, { name: 'nome', label: 'Nome do setor', required: true },
      { name: 'ramais', label: 'Ramais' }, { name: 'sala', label: 'Sala' }, { name: 'emails', label: 'E-mails', full: true }] });
  },
  async 'novo-user'() { await dialogUsuario(); },
  async 'edit-user'(el, d) { const u = (await api('/usuarios')).find(x => x.id === Number(d.id)); await dialogUsuario(u); },
  async config() {
    const c = await api('/config');
    await formDialog({ titulo: 'Parâmetros', valores: c, enviar: x => api('/config', { method: 'PUT', body: x }), campos: [
      { name: 'dias_vence_em_breve', label: 'Dias para “vence em breve”', type: 'number', required: true },
      { name: 'periodicidade_consolidado', label: 'Periodicidade do consolidado', type: 'select', options: [['mensal', 'Mensal'], ['quinzenal', 'Quinzenal']] }] });
  },
  async 'novo-tipo'() { await formDialog({ titulo: 'Novo tipo de demanda', enviar: x => api('/tipos-demanda', { method: 'POST', body: x }).then(async () => { state.tipos = await api('/tipos-demanda'); }), campos: [{ name: 'nome', label: 'Nome', required: true, full: true }] }); },
  async 'csv-demandas'() { baixarCsv(await api('/demandas?limit=1000'), 'demandas.csv'); },
  async 'csv-fora'() { baixarCsv(await api('/demandas?limit=1000&prazo_status=fora'), 'demandas-fora-do-prazo.csv'); },
  imprimir() { window.print(); },
};

function camposDemanda() {
  return [
    { name: 'processo', label: 'Nº do processo SEI / protocolo', required: true, full: true }, { name: 'assunto', label: 'Assunto', required: true, full: true, list: 'dl-assuntos' },
    { name: 'tipo_id', label: 'Tipo de serviço', type: 'select', vazio: '— selecione —', options: opts(state.tipos) },
    { name: 'origem', label: 'Origem', type: 'select', options: mapa(ORIGEM), default: 'escola' },
    { name: 'data_entrada', label: 'Data de entrada', type: 'date', required: true }, { name: 'prazo', label: 'Prazo (data limite)', type: 'date', required: true },
    { name: 'prioridade', label: 'Prioridade', type: 'select', options: mapa(PRIOR), default: 'media' }, { name: 'responsavel', label: 'Responsável' },
    { name: 'status', label: 'Status', type: 'select', options: mapa(STATUS), default: 'aberta' }, { name: 'data_conclusao', label: 'Data de conclusão', type: 'date', hint: 'Se concluída e em branco, usa hoje.' },
    { name: 'observacoes', label: 'Observações', type: 'textarea', full: true }];
}

async function dialogUsuario(u) {
  const campos = [{ name: 'nome', label: 'Nome', required: true, full: true }, { name: 'email', label: 'E-mail institucional', type: 'email', required: true, full: true, hint: 'Deve terminar em @educacao.mg.gov.br' },
    { name: 'perfil', label: 'Perfil', type: 'select', required: true, options: mapa(PERFIL), default: 'coord_setor' },
    { name: 'unit_id', label: 'Unidade (diretor)', type: 'select', vazio: '—', options: state.units.map(x => [x.id, x.sigla]) },
    { name: 'sector_id', label: 'Setor (coordenador de setor)', type: 'select', vazio: '—', options: state.sectors.map(s => [s.id, `${s.unidade} · ${s.nome}`]), full: true },
    { name: 'senha', label: u ? 'Nova senha (opcional)' : 'Senha inicial', type: 'password', required: !u, hint: 'Mínimo de 8 caracteres.', full: true },
    ...(u ? [{ name: 'ativo', label: 'Usuário ativo', type: 'checkbox' }] : [])];
  await formDialog({ titulo: u ? 'Editar usuário' : 'Novo usuário', campos, valores: u || {},
    enviar: x => api(u ? '/usuarios/' + u.id : '/usuarios', { method: u ? 'PUT' : 'POST', body: { ...x, ativo: u ? x.ativo : true } }) });
}

function baixarCsv(lista, nome) {
  const cols = ['processo', 'assunto', 'unidade', 'setor', 'tipo', 'origem', 'data_entrada', 'prazo', 'prazo_status', 'status', 'prioridade', 'responsavel', 'data_conclusao'];
  const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.join(','), ...lista.map(d => cols.map(c => cel(d[c])).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = nome; a.click();
}

function parseCsv(texto) {
  const sep = (texto.split('\n')[0].match(/;/g) || []).length > (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let cur = [], campo = '', asp = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (asp) { if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') asp = false; else campo += c; }
    else if (c === '"') asp = true; else if (c === sep) { cur.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; cur.push(campo); campo = ''; if (cur.some(x => x.trim())) linhas.push(cur); cur = []; }
    else campo += c;
  }
  cur.push(campo); if (cur.some(x => x.trim())) linhas.push(cur);
  const [cab, ...resto] = linhas; const chaves = cab.map(h => h.replace(/^﻿/, '').trim().toLowerCase());
  const data = v => { v = (v || '').trim(); const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : v; };
  return resto.map(r => { const o = {}; chaves.forEach((k, i) => { o[k] = (r[i] || '').trim(); });
    ['data_entrada', 'prazo', 'data_conclusao'].forEach(k => { if (o[k] !== undefined) o[k] = data(o[k]); }); return o; });
}

// ---------- shell, rotas e render ----------
function irPara(h) { location.hash = h; }
function go(h) { irPara(h); return { redirect: true }; }

async function refreshEstrutura() {
  [state.units, state.sectors, state.tipos] = await Promise.all([api('/unidades'), api('/setores'), api('/tipos-demanda')]);
}
async function carregaAlertas() {
  try { state.alertasNovos = (await api('/alertas')).filter(a => !a.lido_em && (state.user.perfil === 'coord_setor' || a.de_user_id !== state.user.id)).length; } catch (_) { state.alertasNovos = 0; }
}

function shell(pagina, rota) {
  const u = state.user;
  const atual = h => (rota === h ? 'aria-current="page"' : '');
  const link = (h, t, ic) => `<a href="${h}" ${atual(h)}><span aria-hidden="true">${ic}</span>${t}</a>`;
  const unidadesNav = state.units.map(x => `<a href="#/unidade/${x.id}" ${rota === '#/unidade/' + x.id ? 'aria-current="page"' : ''}><span aria-hidden="true">▸</span>${esc(x.sigla)}</a>`).join('');
  const crumbs = (pagina.crumbs || []).map(([h, t]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(' › ');
  return html`<div class="shell"><aside class="side" id="side"><div class="brand"><span aria-hidden="true" style="font-size:1.6rem">▮▮</span><span>SRE Metropolitana A<small>Painel de Gestão · SEE/MG</small></span></div>
    <nav class="nav" aria-label="Principal">${new Raw(
      (u.perfil === 'coord_setor' ? link('#/setor/' + u.sector_id, 'Meu setor', '●') : link('#/', 'Visão Geral', '◉')) +
      (u.perfil === 'coord_setor' ? '' : `<div class="sec">Unidades</div>${unidadesNav}`) +
      '<div class="sec">Gestão</div>' +
      `<a href="#/alertas" ${atual('#/alertas')}><span aria-hidden="true">!</span>Alertas${state.alertasNovos ? `<span class="badge-n">${state.alertasNovos}</span>` : ''}</a>` +
      link('#/lista', 'Demandas', '☰') + link('#/relatorios', 'Relatórios', '⎙') + link('#/contatos', 'Contatos', '☎') +
      (['admin', 'superintendente'].includes(u.perfil) ? link('#/admin', 'Administração', '⚙') : ''))}</nav></aside>
    <div class="main"><header class="top"><button class="menu-btn icon-btn" data-act="menu" aria-label="Abrir menu">☰</button>
      <div class="search"><input id="busca" type="search" placeholder="Buscar setor, processo, servidor…" aria-label="Busca global" autocomplete="off"><div id="resultados" class="results hidden"></div></div>
      <button class="icon-btn" data-act="tema" aria-label="Alternar tema claro/escuro">◐</button>
      <span class="small muted" style="text-align:right"><b>${u.nome}</b><br>${PERFIL[u.perfil]}</span>
      <button data-act="senha" class="btn-sm">Senha</button><button data-act="sair" class="btn-sm">Sair</button></header>
    <main id="main" class="content" tabindex="-1">${crumbs ? html`<div class="crumbs">${new Raw(crumbs)}</div>` : ''}
      <div class="row between" style="margin-bottom:16px"><div><h1>${pagina.titulo}</h1>${pagina.sub ? html`<div class="muted">${pagina.sub}</div>` : ''}</div><div class="row no-print">${pagina.acoes || ''}</div></div>
      ${pagina.corpo}</main></div></div>
    <datalist id="dl-assuntos">${['Prestação de contas', 'Solicitação de escola', 'Aposentadoria', 'Averbação de tempo', 'Designação', 'Resposta ao TCE', 'Resposta ao MP'].map(a => html`<option value="${a}">`)}</datalist>`;
}

function loginView() {
  return html`<div class="login"><div class="card"><h1>Painel SRE Metropolitana A</h1><p class="muted">Acesse com seu e-mail institucional.</p>
    <div id="le"></div><form data-form="login"><div class="field"><label for="em" class="req">E-mail</label><input id="em" name="email" type="email" required placeholder="nome@educacao.mg.gov.br" autocomplete="username"></div>
    <div class="field"><label for="se" class="req">Senha</label><input id="se" name="senha" type="password" required autocomplete="current-password"></div>
    <button class="btn-primary" style="width:100%;justify-content:center">Entrar</button></form>
    <p class="small"><a href="#/esqueci">Esqueci minha senha</a></p></div></div>`;
}
function esqueciView() {
  return html`<div class="login"><div class="card"><h1>Recuperar senha</h1><div id="le"></div><form data-form="esqueci"><div class="field"><label class="req" for="em">E-mail institucional</label><input id="em" name="email" type="email" required></div>
    <button class="btn-primary">Gerar link de redefinição</button></form><p class="small"><a href="#/">Voltar ao login</a></p></div></div>`;
}
function redefinirView(token) {
  return html`<div class="login"><div class="card"><h1>Nova senha</h1><div id="le"></div><form data-form="redefinir" data-token="${token}"><div class="field"><label class="req" for="ns">Nova senha</label><input id="ns" name="nova" type="password" minlength="8" required autocomplete="new-password"><div class="hint">Mínimo de 8 caracteres.</div></div>
    <button class="btn-primary">Salvar nova senha</button></form></div></div>`;
}

let seq = 0;
async function render() {
  const app = $('#app'); const mine = ++seq;
  const h = location.hash || '#/'; const [rota, query] = h.split('?'); const partes = rota.replace('#/', '').split('/');
  if (partes[0] === 'redefinir') { app.innerHTML = redefinirView(partes[1]).s; return; }
  if (!state.user) {
    try { state.user = await api('/auth/me'); } catch (_) { state.user = null; }
    if (state.user) { await refreshEstrutura(); await carregaAlertas(); }
  }
  if (!state.user) { app.innerHTML = (partes[0] === 'esqueci' ? esqueciView() : loginView()).s; return; }
  const hist = $('#main'); if (!hist) app.innerHTML = html`<div class="shell"><div></div><div class="content">${skeleton()}</div></div>`.s;
  else hist.innerHTML = skeleton().s;
  let pagina;
  try {
    const [a, b, c] = partes;
    if (!a) pagina = await viewGeral();
    else if (a === 'unidade') pagina = await viewUnidade(b);
    else if (a === 'setor') pagina = await viewSetor(b, c);
    else if (a === 'demanda') pagina = await viewDemanda(b);
    else if (a === 'lista') pagina = await viewLista(query);
    else if (a === 'alertas') pagina = await viewAlertas();
    else if (a === 'contatos') pagina = await viewContatos(query);
    else if (a === 'relatorios') pagina = await viewRelatorios();
    else if (a === 'admin') pagina = await viewAdmin();
    else pagina = { titulo: 'Página não encontrada', corpo: vazio('Página não encontrada') };
  } catch (e) { pagina = { titulo: 'Ops', corpo: html`<div class="error" role="alert">${e.message}</div>` }; }
  if (mine !== seq || (pagina && pagina.redirect)) return;
  const ativo = document.activeElement?.id;
  $('#app').innerHTML = shell(pagina, a_rota(partes)).s;
  document.title = `${pagina.titulo} · Painel SRE Metropolitana A`;
  const m = $('#main'); if (m) m.focus({ preventScroll: true });
  if (ativo === 'busca') $('#busca')?.focus();
}
const a_rota = p => '#/' + p.slice(0, ['unidade', 'setor'].includes(p[0]) ? 2 : 1).join('/').replace(/^$/, '');

// ---------- eventos ----------
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (el) {
    const act = el.dataset.act;
    try {
      if (act === 'tema') alternaTema();
      else if (act === 'menu') $('#side').classList.toggle('open');
      else if (act === 'sair') { await api('/auth/logout', { method: 'POST', body: {} }); state.user = null; location.hash = '#/'; render(); }
      else if (act === 'senha') await formDialog({ titulo: 'Trocar senha', enviar: x => api('/auth/senha', { method: 'POST', body: x }), campos: [
        { name: 'atual', label: 'Senha atual', type: 'password', required: true, full: true }, { name: 'nova', label: 'Nova senha (mín. 8)', type: 'password', required: true, full: true }] });
      else if (acoes[act]) await acoes[act](el, el.dataset);
    } catch (e) { toast(e.message, true); }
    return;
  }
  const sug = ev.target.closest('[data-sugerir]');
  if (sug) {
    ev.preventDefault(); const f = sug.closest('form');
    try {
      const r = await api(`/consolidados/sugestao?sector_id=${sug.dataset.sugerir}&inicio=${f.elements.periodo_inicio.value}&fim=${f.elements.periodo_fim.value}`);
      for (const k of ['recebidas', 'concluidas', 'em_aberto', 'tempo_medio_dias']) f.elements[k].value = r[k] ?? '';
    } catch (e) { toast(e.message, true); }
  }
  if (!ev.target.closest('.search')) $('#resultados')?.classList.add('hidden');
  if (ev.target.closest('.nav a')) $('#side')?.classList.remove('open');
});

document.addEventListener('change', ev => {
  if (ev.target.matches('[data-modelo]') && ev.target.value !== '') {
    const m = window._modelos?.[Number(ev.target.value)]; const f = ev.target.closest('form'); if (!m) return;
    f.elements.nome.value = m.nome; f.elements.meta.value = m.meta; f.elements.unidade.value = m.unidade; f.elements.menor_melhor.checked = m.menor_melhor;
  }
});

document.addEventListener('submit', async ev => {
  const f = ev.target.closest('[data-form]'); if (!f) return;
  ev.preventDefault(); const tipo = f.dataset.form; const v = Object.fromEntries(new FormData(f));
  const erro = m => { const e = $('#le'); if (e) e.innerHTML = html`<div class="error" role="alert">${m}</div>`.s; };
  try {
    if (tipo === 'login') { await api('/auth/login', { method: 'POST', body: v }); state.user = null; location.hash = '#/'; await render(); }
    else if (tipo === 'esqueci') { const r = await api('/auth/esqueci', { method: 'POST', body: v }); $('#le').innerHTML = html`<div class="toast" style="margin-bottom:12px">${r.mensagem}</div>`.s; }
    else if (tipo === 'redefinir') { await api('/auth/redefinir', { method: 'POST', body: { token: f.dataset.token, nova: v.nova } }); toast('Senha alterada. Faça login.'); location.hash = '#/'; }
    else if (tipo === 'filtros') { const p = new URLSearchParams(Object.entries(v).filter(([, x]) => x)); irPara('#/lista?' + p); }
    else if (tipo === 'contatos') irPara('#/contatos?q=' + encodeURIComponent(v.q));
  } catch (e) { erro(e.message); }
});

let buscaT;
document.addEventListener('input', ev => {
  if (ev.target.id !== 'busca') return;
  clearTimeout(buscaT); const termo = ev.target.value.trim(); const box = $('#resultados');
  if (termo.length < 2) { box.classList.add('hidden'); return; }
  buscaT = setTimeout(async () => {
    try {
      const r = await api('/busca?q=' + encodeURIComponent(termo));
      box.innerHTML = (r.setores.length || r.demandas.length ? html`${r.setores.length ? html`<div class="grp">Setores</div>` : ''}${r.setores.map(s => html`<a href="#/setor/${s.id}">${s.unidade} · ${s.nome}</a>`)}
        ${r.demandas.length ? html`<div class="grp">Processos</div>` : ''}${r.demandas.map(d => html`<a href="#/demanda/${d.id}">${d.processo} <span class="muted small">${d.setor} – ${d.assunto}</span></a>`)}` : html`<div class="grp">Nada encontrado</div>`).s;
      box.classList.remove('hidden');
    } catch (_) {}
  }, 250);
});

window.addEventListener('hashchange', render);
render();
