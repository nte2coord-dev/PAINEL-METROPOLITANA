'use strict';

class FonteIndisponivel extends Error {
  constructor(fonte, motivo) { super(`Integração ${fonte} indisponível: ${motivo}`); this.name = 'FonteIndisponivel'; this.fonte = fonte; }
}

function criarConector({ fonte, habilitada = () => false, endpoint = () => '', token = () => '', normalizar = () => { throw new Error('Mapeamento da fonte ainda não configurado.'); } }) {
  return {
    fonte,
    async fetch({ timeoutMs = 15000 } = {}) {
      if (!habilitada()) throw new FonteIndisponivel(fonte, 'conector desativado até validação do contrato e autorização de acesso.');
      const url = endpoint();
      if (!url) throw new FonteIndisponivel(fonte, 'variável de ambiente de endpoint não configurada.');
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const headers = token() ? { Authorization: `Bearer ${token()}` } : {};
        const r = await fetch(url, { headers, signal: ctrl.signal, redirect: 'error' });
        if (!r.ok) throw new Error(`Fonte retornou HTTP ${r.status}.`);
        return await r.json();
      } finally { clearTimeout(timer); }
    },
    normalize: normalizar,
    async sync() { throw new FonteIndisponivel(fonte, 'sincronização permanece desativada até contrato e normalizador serem definidos.'); },
  };
}
module.exports = { FonteIndisponivel, criarConector };
