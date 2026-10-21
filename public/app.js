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

const state = { user: null, units: [], sectors: [], tipos: [], alertasNovos: 0, navAberto: new Set() };
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

const ICONS = {
  clip: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9 13h6M9 17h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  grad: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  home: '<path d="M3 11 12 3l9 8"/><rect x="4" y="11" width="16" height="10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
};
const ico = (n, cls = '') => new Raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`);

function kpis(k, base = '') {
  const item = (cls, ic, n, rot, filtro) => html`<a class="card kpi ${cls}" href="#/lista?${base}${filtro}"><div class="tile">${ico(ic)}</div><b>${n}</b><span>${rot}</span></a>`;
  return html`<div class="grid g-kpi">
    ${item('', 'clip', k.total, 'Total de Demandas', '')}
    ${item('ok', 'clock', k.no_prazo + k.vence_em_breve, k.vence_em_breve ? `No Prazo (${k.vence_em_breve} vencem em breve)` : 'No Prazo', '&prazo_status=no_prazo')}
    ${item('bad', 'alert', k.fora_do_prazo, 'Fora do Prazo', '&prazo_status=fora')}
    ${item('done', 'check', k.concluidas, 'Concluídas', '&prazo_status=concluida')}
    ${item('warn', 'trend', k.pendentes, 'Pendentes', '&aberta=1')}</div>`;
}

// Barras verticais empilhadas por unidade: no prazo (verde), concluídas (azul), fora do prazo (vermelho)
function graficoUnidades(unidades) {
  const W = 640, H = 300, p = { l: 34, r: 8, t: 12, b: 28 };
  const tot = u => u.no_prazo + u.vence_em_breve + u.concluidas + u.fora_do_prazo;
  const max = Math.max(4, ...unidades.map(tot));
  const passo = Math.max(1, Math.ceil(max / 4)); const topo = passo * 4;
  const y = v => H - p.b - (v * (H - p.t - p.b)) / topo;
  const bw = Math.min(100, ((W - p.l - p.r) / unidades.length) * 0.8);
  const cx = i => p.l + ((i + 0.5) * (W - p.l - p.r)) / unidades.length;
  const bars = unidades.map((u, i) => {
    let acc = 0;
    const seg = (n, cor, rot) => { if (!n) return ''; const r = html`<rect x="${cx(i) - bw / 2}" y="${y(acc + n)}" width="${bw}" height="${y(acc) - y(acc + n)}" fill="${cor}"><title>${u.sigla} – ${rot}: ${n}</title></rect>`; acc += n; return r; };
    return html`${seg(u.no_prazo + u.vence_em_breve, 'var(--ok)', 'No prazo')}${seg(u.concluidas, 'var(--done)', 'Concluídas')}${seg(u.fora_do_prazo, 'var(--bad)', 'Fora do prazo')}
      <text x="${cx(i)}" y="${H - 8}" text-anchor="middle">${u.sigla}</text>`;
  });
  const grade = [0, 1, 2, 3, 4].map(f => f * passo);
  return html`<div class="vchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Demandas por unidade, empilhadas por situação">
    ${grade.map(g => html`<line x1="${p.l}" x2="${W - p.r}" y1="${y(g)}" y2="${y(g)}" stroke="var(--border)" stroke-dasharray="3 4"/><text x="${p.l - 8}" y="${y(g) + 4}" text-anchor="end">${g}</text>`)}
    ${bars}</svg></div>`;
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

const eDiretoria = u => /^(DAFI|DIPE|DIRE)/i.test(u.sigla);
const valInd = i => (i.unidade === 'pct' ? `${i.realizado}%` : `${i.realizado}/${i.meta}${i.unidade === 'dias' ? ' dias' : ' un'}`);
const pctInd = i => (i.menor_melhor ? (i.realizado ? Math.min(100, 100 * i.meta / i.realizado) : 100) : Math.min(100, 100 * i.realizado / (i.meta || 1)));

function cartoesUnidades(lista) {
  return html`<div class="g-unit-cards">${lista.map(u => {
    const pc = u.total ? Math.round(100 * u.concluidas / u.total) : 0;
    return html`<a class="card ucard" href="#/unidade/${u.id}">
      <div class="head"><div class="tile">${ico('building')}</div>
        <div><div class="nm">${u.sigla} <span class="pill">${eDiretoria(u) ? 'Diretoria' : 'Coordenação'}</span></div><div class="small muted">${u.nome}</div></div>
        <span class="arrow">${ico('arrow')}</span></div>
      <div class="mini3"><div><b>${u.total}</b><span>Demandas</span></div><div class="g"><b>${u.no_prazo + u.vence_em_breve}</b><span>No prazo</span></div><div class="r"><b>${u.fora_do_prazo}</b><span>Fora</span></div></div>
      <div class="lrow"><span>Concluídas</span><span>${pc}%</span></div><div class="prog"><i style="width:${pc}%"></i></div>
      ${(u.indicadores || []).length ? html`<div class="sect-label">Indicadores</div>${u.indicadores.map(i => html`<div class="lrow"><span>${i.nome}</span><span>${valInd(i)}</span></div>
        <div class="prog"><i class="${pctInd(i) >= 100 ? 'ok' : ''}" style="width:${pctInd(i)}%"></i></div>`)}` : ''}
      <div class="small trend ${u.tendencia > 0 ? 'up' : u.tendencia < 0 ? 'down' : 'muted'}">${u.tendencia == null ? '' : (u.tendencia > 0 ? '▲ +' : u.tendencia < 0 ? '▼ ' : '● ') + u.tendencia + ' p.p. no prazo vs. 30 dias anteriores'}</div></a>`;
  })}</div>`;
}

function situacaoUnidades(lista) {
  return html`${lista.map(u => { const pc = u.total ? Math.round(100 * u.concluidas / u.total) : 0;
    return html`<div style="margin-bottom:14px"><div class="lrow"><b>${u.sigla}</b><span>${pc}%</span></div><div class="prog" style="height:8px"><i style="width:${pc}%"></i></div></div>`; })}
    <div class="hint">Percentual de demandas concluídas por unidade.</div>`;
}

function recentes(lista) {
  if (!lista.length) return vazio('Nenhuma demanda ainda');
  return html`<div class="recent">${lista.map(d => html`<a href="#/demanda/${d.id}"><div class="t"><span class="pill">${d.unidade}</span><b>${d.assunto}</b></div>
    <div class="meta">${d.processo} · Prazo: ${fmtData(d.prazo)}</div></a>`)}</div>`;
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
  const base = qs ? qs + '&' : '';
  const geral = !escopo.unit_id && !escopo.sector_id;
  const extras = html`
    <div class="grid g-2 mt">
      <section class="card"><h2>Evolução mensal</h2>${linhas(r.evolucao)}</section>
      <section class="card"><h2>Setores com mais atrasos</h2>${ranking(r.ranking)}</section>
    </div>
    <section class="card mt"><h2>Mapa de calor: setor × semana</h2>${mapaCalor(r.calor)}</section>
    <section class="card mt"><h2>Vencimentos e atrasos (próximos 7 dias)</h2>${prox.length ? html`<div class="tablewrap"><table><thead><tr><th>Processo</th><th>Assunto</th><th>Setor</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>
      ${prox.map(d => html`<tr><td><a href="#/demanda/${d.id}">${d.processo}</a></td><td>${d.assunto}</td><td>${d.unidade} · ${d.setor}</td><td>${fmtData(d.prazo)}</td><td>${tagPrazo(d.prazo_status)}</td></tr>`)}</tbody></table></div>` : vazio('Nada vencendo nos próximos dias')}</section>`;
  if (!geral) return html`${kpis(r.kpis, base)}${extras}`;
  return html`${kpis(r.kpis, base)}
    <div class="layout-2 mt" style="grid-template-columns:minmax(0,1fr) 380px">
      <section class="card"><div class="row between"><h2>Demandas por Unidade</h2>
        <div class="legend-top"><span><i style="background:var(--ok)"></i>No prazo</span><span><i style="background:var(--bad)"></i>Fora do prazo</span><span><i style="background:var(--done)"></i>Concluídas</span></div></div>
        ${graficoUnidades(r.porUnidade)}</section>
      <section class="card"><h2>Situação das Unidades</h2>${situacaoUnidades(r.porUnidade)}</section>
    </div>
    <div class="layout-2 mt" style="grid-template-columns:minmax(0,1fr) 380px">
      <div><h2>Unidades</h2>${cartoesUnidades(r.porUnidade)}</div>
      <section class="card"><h2>Demandas Recentes</h2>${recentes(r.recentes)}</section>
    </div>${extras}`;
}

async function viewGeral() {
  const u = state.user;
  if (u.perfil === 'coord_setor') return go(`#/setor/${u.sector_id}`);
  if (u.perfil === 'diretor') return go(`#/unidade/${u.unit_id}`);
  return { titulo: 'Painel da Superintendência Regional de Ensino', sub: 'Acompanhamento das diretorias e coordenações — SRE Metropolitana A',
    tags: [['solid', 'Superintendência'], ['', 'Visão geral de todas as unidades']], corpo: await paginaGeral() };
}

async function viewUnidade(id) {
  const un = state.units.find(x => x.id === Number(id));
  if (!un) return { titulo: 'Unidade não encontrada', corpo: vazio('Unidade não encontrada ou sem acesso.') };
  const setores = state.sectors.filter(s => s.unit_id === un.id);
  const corpo = await paginaGeral({}, { unit_id: un.id });
  const lista = html`<section class="card mt"><h2>Setores</h2><div class="tablewrap"><table><thead><tr><th>Setor</th><th>Ramal</th><th></th></tr></thead><tbody>
    ${setores.map(s => html`<tr><td><a href="#/setor/${s.id}">${s.nome}</a></td><td>${s.ramais.join(' / ') || '–'}</td><td><a class="btn btn-sm" href="#/setor/${s.id}">Abrir</a></td></tr>`)}</tbody></table></div></section>`;
  return { titulo: `${un.sigla}`, sub: un.nome, voltar: ['#/', 'Voltar ao Painel Geral'], tags: [['solid', un.sigla], ['', eDiretoria(un) ? 'Diretoria' : 'Coordenação']],
    corpo: html`${corpo}${lista}`, acoes: podeAlertar() ? html`<button data-act="alerta" data-unit="${un.id}">${ico('bell')} Alerta</button>` : '' };
}

function abasSetor(id, ativa) {
  const abas = [['resumo', 'Resumo'], ['demandas', 'Demandas'], ['pendencias', 'Pendências'], ['consolidado', 'Consolidado'], ['indicadores', 'Indicadores']];
  return html`<nav class="tabs" aria-label="Seções do setor">${abas.map(([k, l]) => html`<a href="#/setor/${id}/${k}" ${attr(k === ativa, 'aria-current="page"')}>${l}</a>`)}</nav>`;
}

async function viewSetor(id, aba = 'resumo') {
  const s = state.sectors.find(x => x.id === Number(id));
  if (!s) return { titulo: 'Setor não encontrado', corpo: vazio('Setor não encontrado ou sem acesso.') };
  const un = state.units.find(u => u.id === s.unit_id);
  const pode = podeLancar(s.id);
  let corpo, acoes = '';
  if (aba === 'resumo') {
    const [r, lista, pend, inds] = await Promise.all([api('/dashboard/resumo?sector_id=' + s.id), api('/demandas?sector_id=' + s.id + '&limit=500'),
      api('/pendencias?sector_id=' + s.id), api('/indicadores?sector_id=' + s.id)]);
    const abertas = lista.filter(d => !['concluida', 'cancelada'].includes(d.status)).slice(0, 6);
    const pAb = pend.filter(p => !p.resolvida).slice(0, 4);
    const contato = (ic, rot, v) => (v ? html`<div class="contact"><div class="tile">${ico(ic)}</div><div><small>${rot}</small><b>${v}</b></div></div>` : '');
    const vazioC = (t) => html`<p class="muted" style="text-align:center;padding:28px 8px">${t}</p>`;
    corpo = html`<div class="layout-2"><div class="stack">${kpis(r.kpis, 'sector_id=' + s.id + '&')}
      <div class="grid g-2">
        <section class="card"><div class="row between"><h2>Demandas e Pendências</h2><a class="small" href="#/setor/${s.id}/demandas">Ver todas</a></div>
          ${abertas.length || pAb.length ? html`${abertas.map(d => html`<a class="item" href="#/demanda/${d.id}"><div><b>${d.processo}</b><div>${d.assunto}</div><div class="meta">Prazo: ${fmtData(d.prazo)}</div></div>${tagPrazo(d.prazo_status)}</a>`)}
            ${pAb.length ? html`<div class="sect-label" style="margin-top:12px">Pendências</div>${pAb.map(p => html`<div class="item"><div>${p.descricao}<div class="meta">${p.responsavel || ''} ${p.prazo ? '· até ' + fmtData(p.prazo) : ''}</div></div>${p.atrasada ? html`<span class="tag t-fora">Atrasada</span>` : ''}</div>`)}` : ''}`
            : vazioC('Nenhuma demanda registrada para este setor.')}</section>
        <section class="card"><div class="row between"><h2>Indicadores</h2><a class="small" href="#/setor/${s.id}/indicadores">Gerenciar</a></div>
          ${inds.length ? inds.map(i => html`<div style="margin-bottom:12px"><div class="lrow"><b>${i.nome}</b><span>${i.realizado == null ? 'sem lançamento' : valInd(i)}</span></div>
            <div class="prog"><i class="${i.realizado != null && pctInd(i) >= 100 ? 'ok' : ''}" style="width:${i.realizado == null ? 0 : pctInd(i)}%"></i></div></div>`)
            : vazioC('Nenhum indicador registrado para este setor.')}</section>
      </div></div>
      <section class="card"><h2>Contatos</h2>
        ${contato('hash', 'Ramal', s.ramais.join(' / '))}${contato('phone', 'Telefone', s.telefones.join(' / '))}${contato('pin', 'Sala', s.sala)}
        ${s.emails.map(e => contato('mail', 'E-mail', e))}
        ${s.ramais.length || s.telefones.length || s.sala || s.emails.length ? '' : vazioC('Sem contatos cadastrados.')}</section></div>`;
    if (pode) acoes = html`<button data-act="novo-ind" data-sector="${s.id}">${ico('plus')} Indicador</button><button class="btn-primary" data-act="nova-demanda" data-sector="${s.id}">${ico('plus')} Demanda</button>`;
  } else if (aba === 'demandas') {
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
  return { titulo: s.nome, sub: un.nome, voltar: [`#/unidade/${un.id}`, `Voltar para ${un.sigla}`], tags: [['solid', un.sigla], ['', 'Setor']],
    corpo: html`${abasSetor(s.id, aba)}${corpo}`, acoes: html`${podeAlertar() ? html`<button data-act="alerta" data-sector="${s.id}">${ico('bell')} Alerta</button>` : ''}${acoes}` };
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
  const cur = h => (rota === h ? 'aria-current="page"' : '');
  const navLink = (h, t, ic, extra = '') => `<a href="${h}" ${cur(h)}>${ico(ic).s}<span>${esc(t)}</span>${extra}</a>`;
  const grupo = un => {
    const abre = state.navAberto.has(un.id) || rota === '#/unidade/' + un.id || state.sectors.some(s => s.unit_id === un.id && rota === '#/setor/' + s.id);
    const subs = state.sectors.filter(s => s.unit_id === un.id).map(s =>
      `<a href="#/setor/${s.id}" ${rota === '#/setor/' + s.id ? 'aria-current="page"' : ''} title="${esc(s.nome)}">${ico('chev').s}<span>${esc(s.nome)}</span></a>`).join('');
    return `<details data-unit="${un.id}" ${abre ? 'open' : ''}><summary>${ico('building').s}<a class="u-t" href="#/unidade/${un.id}" style="padding:0;margin:0;color:inherit;background:none">${esc(un.sigla)}<small>${esc(un.nome)}</small></a>${ico('chev', 'chev').s}</summary><div class="sub">${subs}</div></details>`;
  };
  const dir = state.units.filter(eDiretoria), coord = state.units.filter(x => !eDiretoria(x));
  const alertasBadge = state.alertasNovos ? `<span class="badge-n">${state.alertasNovos}</span>` : '';
  const nav = navLink('#/', 'Painel Geral', 'grid') +
    (dir.length ? `<div class="sec">Diretorias</div>${dir.map(grupo).join('')}` : '') +
    (coord.length ? `<div class="sec">Coordenações</div>${coord.map(grupo).join('')}` : '') +
    '<div class="sec">Gestão</div>' + navLink('#/alertas', 'Alertas', 'bell', alertasBadge) + navLink('#/lista', 'Demandas', 'list') +
    navLink('#/relatorios', 'Relatórios', 'doc') + navLink('#/contatos', 'Contatos', 'phone') +
    (['admin', 'superintendente'].includes(u.perfil) ? navLink('#/admin', 'Administração', 'gear') : '');
  const crumbs = (pagina.crumbs || []).map(([h, t]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(' › ');
  return html`<div class="shell"><aside class="side" id="side"><div class="brand"><span class="logo">${ico('grad')}</span><span>SRE Metropolitana A<small>Painel de Gestão</small></span></div>
    <nav class="nav" aria-label="Principal">${new Raw(nav)}</nav></aside>
    <div class="main"><header class="top"><button class="menu-btn icon-btn" data-act="menu" aria-label="Abrir menu">${ico('list')}</button>
      <div class="search"><input id="busca" type="search" placeholder="Buscar setor, processo, servidor…" aria-label="Busca global" autocomplete="off"><div id="resultados" class="results hidden"></div></div>
      <span style="flex:1"></span><button class="icon-btn" data-act="tema" aria-label="Alternar tema claro/escuro">${ico('moon')}</button>
      <span class="small muted" style="text-align:right"><b>${u.nome}</b><br>${PERFIL[u.perfil]}</span>
      <button data-act="senha" class="btn-sm">Senha</button><button data-act="sair" class="btn-sm">Sair</button></header>
    <main id="main" class="content" tabindex="-1">
      ${pagina.voltar ? html`<a class="back" href="${pagina.voltar[0]}">${ico('left')} ${pagina.voltar[1]}</a>` : (crumbs ? html`<div class="crumbs">${new Raw(crumbs)}</div>` : '')}
      <div class="page-head"><div>${pagina.tags ? html`<div class="tags">${pagina.tags.map(([c, t]) => html`<span class="pill ${c}">${t}</span>`)}</div>` : ''}<h1>${pagina.titulo}</h1>${pagina.sub ? html`<div class="sub">${pagina.sub}</div>` : ''}</div>
        <div class="row no-print">${pagina.acoes || ''}</div></div>
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

document.addEventListener('toggle', ev => {
  const d = ev.target; if (!(d instanceof HTMLDetailsElement) || !d.dataset.unit) return;
  const id = Number(d.dataset.unit); if (d.open) state.navAberto.add(id); else state.navAberto.delete(id);
}, true);
window.addEventListener('hashchange', render);
render();
