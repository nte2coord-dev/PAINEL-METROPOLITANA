// Estrutura organizacional (Decreto 48.709/2023 + planilha de contatos).
// Suposição registrada no README: a lista de setores abaixo parte dos exemplos
// da planilha; o que faltar é cadastrado pela interface (Administração).
module.exports.UNITS = [
  { sigla: 'DAFI', nome: 'Diretoria de Administração e Finanças', setores: [
    'Compras / Diárias / Sistema Documentação', 'Finanças / Contabilidade', 'DIVOF',
    'Patrimônio', 'Prestação de Contas', 'Rede Física', 'Nutrição'] },
  { sigla: 'DIPE', nome: 'Diretoria de Pessoal', setores: [
    'Pagamento / Taxação', 'Ação e Jurídico', 'Averbação', 'Ponto Digital / SEI',
    'Cadastro / Arquivo', 'Gestão de Pessoal', 'Aposentadoria', 'Avaliação de Desempenho',
    'Movimentação / Designação', 'CAT'] },
  { sigla: 'DIRE A', nome: 'Diretoria Educacional A', setores: [
    'Expedição / Protocolo', 'Escola Extinta', 'SEDINE',
    'Organização do Atendimento / SUCEM', 'DIVAE Processo Escolar'] },
  { sigla: 'DIRE B', nome: 'Diretoria Educacional B', setores: [
    'Ensino Médio', 'SAI', 'DIVEP', 'Recepção / GIDE'] },
  { sigla: 'Coordinspe', nome: 'Coordenação da Inspeção Escolar', setores: ['Inspeção Escolar'] },
  { sigla: 'NTE', nome: 'Núcleo de Tecnologia Educacional', setores: ['Tecnologia Educacional'] },
  { sigla: 'Superintendência', nome: 'Superintendência / Gabinete', setores: [
    'Assessoria de Gabinete', 'Comissão Processante', 'Recepção'] },
];

module.exports.TIPOS_DEMANDA = [
  'Solicitação de escola', 'Solicitação de servidor', 'Ofício', 'Processo SEI',
  'Prestação de contas', 'Aposentadoria', 'Averbação', 'Designação / Movimentação',
  'Resposta a órgão de controle', 'Ouvidoria', 'Outros',
];

module.exports.CONFIG_DEFAULTS = {
  dias_vence_em_breve: '3',
  periodicidade_consolidado: 'mensal',
};

// Modelos de indicadores pré-prontos
module.exports.MODELOS_INDICADOR = [
  { nome: '% de processos no prazo', unidade: 'pct', meta: 90, menor_melhor: false },
  { nome: 'Tempo médio de resposta (dias)', unidade: 'dias', meta: 5, menor_melhor: true },
  { nome: 'Nº de atendimentos', unidade: 'num', meta: 100, menor_melhor: false },
  { nome: 'Prestações de contas analisadas × recebidas (%)', unidade: 'pct', meta: 100, menor_melhor: false },
  { nome: 'Aposentadorias instruídas', unidade: 'num', meta: 20, menor_melhor: false },
  { nome: 'Escolas atendidas', unidade: 'num', meta: 50, menor_melhor: false },
];
