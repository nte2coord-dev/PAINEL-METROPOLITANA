# Painel de Gestão – SRE Metropolitana A (SEE/MG)

Dashboard de acompanhamento de demandas, pendências, prazos e indicadores por unidade e setor
(estrutura do Decreto nº 48.709/2023). Node.js + Express, PostgreSQL, front-end em JavaScript puro (sem build).

> O arquivo `painel-metropolitana.zip` na raiz é de um projeto anterior (portal de atalhos) e não faz parte deste sistema.

## Rodar localmente
```bash
npm install
export DATABASE_URL=postgres://usuario@localhost:5432/painel
SEED_DEMO=true npm start   # http://localhost:3000
```
`SEED_DEMO=true` cria demandas fictícias (só se não houver nenhuma). Não use em produção.

## Deploy no Render
Variáveis do serviço web: `DATABASE_URL` (Internal Database URL do PostgreSQL), `NODE_ENV=production` e `NODE_VERSION=22`.
Com o Blueprint (`render.yaml`) elas já vêm preenchidas.

## Autenticação e perfis

O modo sem login continua como padrão local de desenvolvimento (`AUTH_ENABLED` omitida ou `false`) e mantém o comportamento anterior de administrador único. **Não use dados pessoais ou reais nesse modo.** Para ambiente protegido, habilite `AUTH_ENABLED=true` e configure `AUTH_ADMIN_EMAIL` e `AUTH_ADMIN_PASSWORD` (mínimo 12 caracteres) somente nas variáveis secretas do serviço. A conta administrativa de bootstrap é criada/atualizada na inicialização; sessões têm duração de 8 horas, cookie `HttpOnly`/`SameSite=Strict`, e o banco guarda apenas hash do token. A gestão básica de contas fica em `/api/usuarios` para administradores. Perfis disponíveis continuam `superintendente`, `admin`, `diretor` e `coord_setor`.

No Render, informe as variáveis secretas no painel do serviço antes de ativar a autenticação. Sem `AUTH_ADMIN_PASSWORD`, a inicialização falha de forma segura quando `AUTH_ENABLED=true`.

## Férias e Afastamentos

O módulo usa PostgreSQL e migrações versionadas em `db/migrations/`. Cadastre escolas e diretores pela tela Férias e Afastamentos. As regras contam dias corridos inclusivamente, limitam o direito a 60 dias e seis períodos, recusam sobreposição e validam saldo no servidor. Lotes podem ser aplicados, editados ou removidos; diretores que não comportarem o período recebem rejeição individual. Outros afastamentos contam dias úteis; fins de semana são excluídos e feriados podem ser informados no formulário.

O extrato individual e o relatório geral são páginas imprimíveis (use “Imprimir / Salvar como PDF”) com código persistido e rota pública de verificação. O portal `/ferias-publico.html` expõe somente nome, escola, períodos e saldo. Não publica links de Drive nem afastamentos. O código antigo de acesso fixo citado no protótipo deve ser tratado como comprometido e rotacionado no sistema de origem; ele não é reutilizado.

## Integrações externas

As telas de saúde e a tabela `integracoes_log` estão disponíveis para Administração. Os conectores em `src/integrations/` são deliberadamente inativos: não conectam ao Portal DIPE e não leem o Apps Script. As variáveis `DIPE_SYNC_ENABLED`, `DIPE_API_URL`, `DIPE_API_TOKEN`, `APPS_SCRIPT_SYNC_ENABLED`, `APPS_SCRIPT_URL` e `APPS_SCRIPT_TOKEN` não habilitam sozinhas o sincronismo: antes são necessários contrato, autorização e mapeamento/fixtures reais. O Apps Script informado redireciona para login institucional; a lógica dele ainda não foi portada. Não use scraping nem credenciais de usuário pessoal como fallback.

O staging JSONB e a fila de pendências permitem receber lotes quando os conectores forem configurados. Não há agendamento periódico ativo nesta etapa. “Sincronizar agora” grava a tentativa e informa que o conector continua inativo.

## Migrações e testes

`npm test` executa os testes com `node --test`. Migrações novas devem ser arquivos SQL incrementais e idempotentes em `db/migrations/`, com nome numérico e imutáveis depois de aplicadas. O esquema-base existente continua sendo aplicado pelo bootstrap.

## Importar a planilha de contatos
A planilha `Contatos_e_Ramais.xlsx` **não chegou anexa** à conversa; o seed atual usa os setores citados no prompt (sem ramais).
Quando tiver o arquivo: `DATABASE_URL=... npm run import:contatos -- Contatos_e_Ramais.xlsx`
(separa múltiplos ramais/e-mails, agrupa linhas duplicadas, trata Inspeção e NTE como coordenações independentes).
Os nomes de coluna esperados estão no topo de `src/import-contatos.js` — ajuste se diferirem.

## Suposições (configuráveis)
- "Vence em breve" = ≤ 3 dias (Administração › Parâmetros). Status de prazo é sempre calculado pelo sistema.
- "Pendentes" = demandas não concluídas/canceladas. "Fora do prazo" = vencidas e não concluídas.
- Tendência = % no prazo das demandas entradas nos últimos 30 dias vs. 30 dias anteriores.
- Setores partem dos exemplos do prompt; edite/adicione pela interface.

## Estado e próximos passos
Implementado: auditoria, visão geral e por unidade, setor (demandas, pendências, consolidado, indicadores),
linha do tempo, alertas, contatos, busca global, relatórios CSV/PDF, importação CSV, tema claro/escuro, migrações versionadas,
flag de autenticação com sessões, módulo de férias/afastamentos, portal público minimizado, códigos verificáveis e tela de saúde das integrações.
Pendente: acesso à fonte/código do Apps Script e planilhas, contrato/API autorizado da DIPE, normalizadores e sincronização real,
agenda automática, importação com prévia CSV/XLSX, anexos binários, alertas automáticos de vencimento, histórico por período de indicadores
e testes de integração com fontes externas.
