'use strict';
const { criarConector } = require('./index');
module.exports = criarConector({
  fonte: 'appsscript',
  habilitada: () => process.env.APPS_SCRIPT_SYNC_ENABLED === 'true',
  endpoint: () => process.env.APPS_SCRIPT_URL || '',
  token: () => process.env.APPS_SCRIPT_TOKEN || '',
  normalizar: () => { throw new Error('Mapeamento Apps Script pendente de código-fonte e amostras autorizadas; nenhum campo foi presumido.'); },
});
