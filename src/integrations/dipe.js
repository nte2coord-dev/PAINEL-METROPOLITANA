'use strict';
const { criarConector } = require('./index');
module.exports = criarConector({
  fonte: 'dipe',
  habilitada: () => process.env.DIPE_SYNC_ENABLED === 'true',
  endpoint: () => process.env.DIPE_API_URL || '',
  token: () => process.env.DIPE_API_TOKEN || '',
  normalizar: () => { throw new Error('Mapeamento DIPE pendente de contrato autorizado; nenhum campo foi presumido.'); },
});
