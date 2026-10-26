# PROMPT — Integração e evolução do Painel de Gestão SRE Metropolitana A

## Papel
Você é um engenheiro full-stack sênior trabalhando no repositório `nte2coord-dev/PAINEL-METROPOLITANA` (Node.js 20+ + Express, PostgreSQL, front-end em JavaScript puro sem build, deploy no Render via `render.yaml`). O sistema é o dashboard de monitoramento da Superintendência Regional de Ensino Metropolitana A (SEE/MG), usado por Superintendência, Diretorias e Coordenações (estrutura do Decreto nº 48.709/2023). Trabalhe em português do Brasil (UI, commits, comentários) e na branch designada. Não crie PR sem pedido.

## Objetivo
Transformar o painel em um **hub único**: cada setor alimenta seus próprios dados (formulários, importação CSV/XLSX ou integração), e o dashboard consolida tudo em indicadores, alertas e relatórios por perfil. Integrar três fontes:

1. **Portal da DIPE** (https://portal-sre-metropolitana-a.onrender.com/) — aplicação já existente; será a **base de dados da Diretoria DIPE**. Integrar como fonte externa, sem reescrevê-la.
2. **Web App Google Apps Script** (https://script.google.com/a/macros/educacao.mg.gov.br/s/AKfycbxhHP2EYk_HPfCg8LtM1ocKR03rH_BXfxQpxhSCpuCicawTgtDjns_qkwD1UAq6Bqm4/exec) — parte já criada; a lógica/funcionalidade deve ser **implementada no código principal** (portada para rotas/módulos do painel, com dados no PostgreSQL), deixando o Apps Script só como fonte legada de importação até a migração terminar.
3. **Módulo "Férias e Afastamentos"** (HTML autônomo em `localStorage`, anexado: `e1806ed2-gemini-code-1793031365032.html`) — portar para o sistema principal (ver seção própria).

## Fase 0 — Descoberta (obrigatória antes de codar)
- Leia `README.md`, `db/schema.sql`, `src/server.js`, `src/routes/*`, `src/org.js`, `public/app.js` e mapeie: modelo de dados, setores/unidades, perfis (RBAC inativo), padrão de rotas, componentes de UI.
- Inspecione as duas URLs externas (HTML, formulários, endpoints `doGet/doPost`, JSON expostos, planilhas de origem, rotas do portal DIPE). Se algo exigir autenticação ou não estiver acessível, **pare e liste** o que precisa (contrato da API, planilha, token) em vez de inventar. Nunca assuma campos: documente o mapeamento observado.
- Entregue um **plano curto** (arquitetura, tabelas novas, rotas, riscos, ordem das entregas) e só então implemente, em commits pequenos por fase.

## Arquitetura de integração
- **Camada de conectores** em `src/integrations/` (um arquivo por fonte: `dipe.js`, `appsscript.js`), todos com a mesma interface: `fetch()` → normaliza → `upsert` no PostgreSQL. Idempotência por chave externa (`fonte`, `id_externo`) e coluna `atualizado_em`.
- **Sincronização**: botão "Sincronizar agora" (Administração) + agendamento (ex.: a cada 30 min via `setInterval`/cron do Render), com timeout, retry exponencial e circuito aberto se a fonte cair. O painel deve continuar funcionando com o último dado salvo e exibir "dados de DD/MM HH:mm — fonte indisponível".
- **Tabela `integracoes_log`**: fonte, início/fim, registros lidos/criados/atualizados/rejeitados, erro. Tela de saúde das integrações na Administração.
- **Staging**: dados externos entram primeiro em tabela `*_raw` (JSONB) e só depois são normalizados; registros inválidos vão para uma fila de "pendências de importação" com o motivo, sem derrubar o lote.
- Mapear cada dado importado para **unidade/setor** do `org.js`; o que não casar vai para "Sem setor" com alerta para correção manual. DIPE é a fonte soberana dos dados da Diretoria DIPE (somente leitura no painel, com link "abrir no Portal DIPE").
- Segredos (URLs com token, chaves) **apenas em variáveis de ambiente** (`DIPE_API_URL`, `DIPE_API_TOKEN`, `APPS_SCRIPT_URL`, …) e documentadas no `render.yaml`/README. Nada de credencial no front-end ou no repositório.
- CORS/iframe: se o portal DIPE ou o Apps Script não permitir consumo por API, ofereça fallback documentado (exportação CSV/JSON agendada, ou leitura de planilha Google compartilhada) — nunca scraping frágil sem avisar.

## Alimentação de dados pelos setores
- Cada setor/coordenação passa a ter uma **área própria de lançamento**: demandas, pendências, prazos, responsável, status, anexos/link do Drive, observação, e indicadores com meta e valor por período.
- Formulários com validação no servidor (não só no navegador), campos obrigatórios claros, datas em formato BR, edição com histórico (quem/quando/o quê — reaproveitar a auditoria existente).
- Importação em lote **CSV e XLSX** (exceljs já presente) com modelo para download, pré-visualização, relatório de erros por linha e confirmação antes de gravar.
- Cada setor vê e edita apenas o seu; Superintendência e Diretorias veem o consolidado da sua diretoria; Superintendência vê tudo. Reativar o RBAC existente atrás de uma flag (`AUTH_ENABLED`), mantendo o modo atual sem login em desenvolvimento.

## Dashboard (melhorias)
- Visão Superintendência → Diretoria → Coordenação → Setor, com cartões-resumo (pendentes, fora do prazo, vencem em ≤3 dias, concluídos no mês, tendência 30 vs 30 dias — regras já definidas no README; mantenha-as).
- Painel por fonte: indicadores da DIPE, do Apps Script e do módulo de férias lado a lado, com selo de "última atualização".
- Filtros combináveis (diretoria, setor, período, status, fonte), busca global, drill-down do gráfico até o registro, exportação CSV/PDF do que está filtrado.
- Alertas: vencimentos, setores sem atualização há N dias, falha de integração, férias de diretores sobrepostas/saldo crítico.
- Acessível (contraste, teclado), responsivo (celular) e tema claro/escuro já existente. Sem framework novo; só adicionar biblioteca de gráficos leve se o padrão atual não bastar, versionada e sem build.

## Módulo Férias e Afastamentos (portar o HTML anexo)
Regras a preservar: direito de **60 dias** corridos (Estatuto do Magistério MG), no máximo **6 períodos**, saldo = 60 − gozados; períodos **em lote** (modelo padrão aplicado/removido/editado para todos os diretores, respeitando saldo e limite de períodos); **outros afastamentos** (luto etc.) em **dias úteis**, sem descontar do saldo; link do Google Drive por período; extrato individual e relatório geral em **PDF** com código de autenticidade; portal público somente-leitura com diretor, escola, períodos e dias restantes.
Corrija ao portar (falhas do protótipo):
- **Remover usuário/senha fixos no código** (estão escritos em texto puro no HTML do protótipo; considere-os comprometidos e troque-os): autenticação no servidor, senha em variável de ambiente ou RBAC do sistema, hash, sessão com expiração.
- Trocar `localStorage` por tabelas PostgreSQL (`diretores`, `ferias_periodos`, `ferias_lotes`, `afastamentos`), vinculando `diretor` → unidade escolar do `org.js`/cadastro de escolas (evitar texto livre duplicado).
- Escapar todo texto inserido via `innerHTML` (risco de XSS), validar `fim ≥ início`, impedir períodos **sobrepostos** do mesmo diretor e conferir cálculo de dias (usar datas locais, não `new Date('YYYY-MM-DD')` em UTC; feriados opcionais no cálculo de dias úteis).
- Código de autenticidade do PDF gerado e **persistido no servidor** (hoje é aleatório e não verificável) com rota pública de verificação.
- Portal público: expor só nome, escola, períodos e saldo — nunca links do Drive nem afastamentos (dado sensível/LGPD). Atenção à LGPD em tudo que tenha dado pessoal; logs sem dados pessoais.

## Qualidade e segurança
- SQL parametrizado; `helmet` e CSP; limite de tamanho/tipo de upload; rate limit nas rotas de importação/sync; sanitização de saída; nenhuma credencial em código.
- Migrações versionadas e idempotentes em `db/` (sem perder dados existentes); seeds demo só com `SEED_DEMO=true`.
- Testes com `node --test` para: regras de saldo/períodos/dias úteis, normalização de cada conector (com fixtures das respostas reais), idempotência do upsert, permissões por perfil. Rode testes e suba o servidor localmente antes de declarar pronto; relate o que **não** pôde verificar (ex.: URL externa inacessível).
- Atualize o `README.md` (variáveis, como sincronizar, mapeamento de campos, como adicionar uma nova fonte/setor).

## Entregas, em ordem
1. Plano + mapeamento das fontes (Fase 0).
2. Camada de integração + log + tela de saúde; conector DIPE.
3. Porte do Apps Script para o código principal (rotas, tabelas, telas).
4. Módulo Férias e Afastamentos (com correções acima).
5. Áreas de lançamento por setor + importação CSV/XLSX.
6. Dashboard consolidado, filtros, alertas e relatórios.
7. Testes, RBAC atrás de flag, documentação.

## Regras de trabalho
Mudanças mínimas e compatíveis com o padrão do código existente; não reescreva o que funciona; não remova o modo sem login de desenvolvimento sem aviso; pergunte apenas quando houver bloqueio real (acesso às fontes, regra de negócio ambígua). Ao final de cada fase, resuma o que mudou, como testar e o que falta.
