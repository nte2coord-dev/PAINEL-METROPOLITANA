# Fase 0 — Descoberta e plano de implementação

**Repositório inspecionado:** `nte2coord-dev/PAINEL-METROPOLITANA` (clone público, branch padrão; nenhuma alteração de código feita nesta fase).

## O que existe hoje

O painel é uma aplicação Node.js/Express, PostgreSQL e JavaScript puro, sem etapa de build. O esquema existente usa tabelas e colunas em inglês (`units`, `sectors`, `users`, `demandas`, `pendencias`, `indicadores`, `audit_log`), com chaves estrangeiras e auditoria. As rotas seguem `/api/...`, separadas em `src/routes/dashboard.js`, `data.js` e `admin.js`; validação e escopo de acesso ficam principalmente em `src/util.js`. A inicialização executa migração idempotente do `db/schema.sql`, seeds básicos e, opcionalmente, demo.

A interface atual é uma SPA em `public/app.js`, com navegação por hash, renderização HTML com escape, formulários em `<dialog>`, tema claro/escuro, tabelas, gráficos SVG, busca, relatórios CSV/PDF e importação CSV de demandas. `exceljs` já está nas dependências, embora a importação atual descrita no README seja CSV. O README define “vence em breve” como até 3 dias; pendentes como demandas não concluídas/canceladas; fora do prazo como vencidas e não concluídas; e tendência como comparação de pontualidade das entradas nos últimos 30 dias com os 30 anteriores.

A estrutura em `src/org.js` traz DAFI, DIPE, DIRE A, DIRE B, Coordinspe, NTE e Superintendência/Gabinete com setores associados. O banco mantém perfis `superintendente`, `admin`, `diretor` e `coord_setor`, e `util.js` contém escopos RBAC, mas `loadUser` atualmente atribui sempre o primeiro usuário admin ativo. Portanto, não há autenticação real hoje; o README alerta que qualquer visitante tem acesso total. O `org.js` também registra que a estrutura parte de exemplos e pode estar incompleta.

## Fontes externas — observações e limites

**Portal DIPE:** a URL informada responde HTTP 200 e entrega uma aplicação web. O HTML observado carrega scripts próprios (`js/supabase.js`, `js/store.js` e `js/app.js`, entre outros), inclui formulários de login/OTP e gestão de usuários/servidores. A página pública não expõe, de forma verificável, um contrato de API, esquema de resposta, endpoints de consulta de dados DIPE, campos, política de paginação ou autorização de serviço. A existência de cliente Supabase no front-end, por si só, não autoriza nem define integração servidor-servidor. Nenhum campo de dados DIPE foi inferido.

**Google Apps Script:** a URL informada responde com redirecionamento HTTP 302 para a tela de login do domínio `educacao.mg.gov.br`. Não foi possível ver o HTML da aplicação, identificar `doGet`/`doPost`, respostas JSON, planilha(s), cabeçalhos ou campos. Assim, não há base segura para portar funcionalidades ou criar fixtures “reais” sem acesso ao projeto e aos dados de origem.

**Módulo de férias:** o protótipo HTML consta no conteúdo do DOCX recebido, com as regras e telas descritas no documento. O código de autenticação fixo ali mencionado deve ser considerado comprometido, removido e substituído — não reutilizar. A implementação deve seguir os requisitos de LGPD definidos no documento, em especial não publicar link do Drive nem afastamentos no portal público.

## Plano curto

### Arquitetura

Preservar Express, PostgreSQL, `org.js`, SPA e padrões existentes. Criar migrations versionadas e idempotentes; tabelas novas em português/snake_case terão `fonte`, `id_externo`, `criado_em` e `atualizado_em` quando aplicável, além de vínculo às unidades/setores existentes. Cada conector será isolado em `src/integrations/`, usando uma interface comum de leitura, normalização, staging, validação e upsert idempotente. Conectores externos ficarão desativados até haver API/exportação autorizada e mapeamento confirmado. Dados brutos irão para staging JSONB; erros por registro serão pendências, sem abortar o lote. A saúde e o histórico ficarão em `integracoes_log` e serão visíveis somente a perfis autorizados.

### Tabelas propostas

- Integração: `integracoes_log`, `pendencias_importacao` e tabelas de staging específicas (`dipe_raw`, `appsscript_raw` ou esquema equivalente), sem impor campos desconhecidos às tabelas normalizadas.
- Operação setorial: ampliar ou criar entidades para anexos/links e valores de indicadores por período; manter as tabelas atuais de demandas e pendências compatíveis.
- Férias: `diretores`, `ferias_periodos`, `ferias_lotes`, `afastamentos` e persistência de códigos de autenticidade dos extratos. A tabela de diretores deve referenciar cadastro institucional de escolas/unidades, após identificar se esse cadastro existe e como relacioná-lo.

### Rotas e telas planejadas

- `POST /api/integracoes/:fonte/sincronizar`, `GET /api/integracoes/saude` e endpoints administrativos de pendências/importações, limitados por perfil e rate limit.
- Módulos sob `/api/ferias/...` para diretores, períodos, lotes, afastamentos, extratos e relatórios; rota pública de verificação do código e portal público somente leitura com os campos expressamente permitidos.
- Rotas de importação CSV/XLSX com modelo, prévia, validação linha a linha e confirmação; rotas setoriais com validação no servidor e auditoria.
- Telas integradas à navegação existente: saúde de integrações em Administração; Férias e Afastamentos; área de lançamento do setor; filtros consolidados e cartões por fonte no dashboard.

### Riscos e decisões técnicas

1. Sem contrato/dados autorizados das fontes, não é possível garantir normalização, deduplicação, sincronização nem fixtures reais. Não fazer scraping de páginas autenticadas nem tentar contornar login/CORS.
2. As unidades organizacionais atualmente são uma base presumida e não incluem necessariamente escolas. Confirmar cadastro e relações antes de criar chaves estrangeiras para férias.
3. O RBAC está inativo em desenvolvimento; reativá-lo por `AUTH_ENABLED` exige escolher e validar a configuração de autenticação/sessão. Não expor dados reais enquanto isso estiver desligado.
4. O portal público de férias envolve dados pessoais. Minimizar resposta pública, não registrar dados pessoais em logs e testar autorização/escopo antes de disponibilizar.
5. Sincronização agendada em Render pode executar em mais de uma instância; evitar duplicidade com lock/advisory lock ou agendador externo, e incluir timeout, retry limitado e circuito aberto.

### Ordem proposta

1. Encerrar Fase 0 com contratos, amostras e mapeamentos confirmados.
2. Infraestrutura de conectores, staging, log, saúde e conector DIPE em modo inativo até autorização.
3. Levantar e portar o comportamento Apps Script para módulos próprios; importação legada temporária apenas com exportação autorizada.
4. Portar Férias e Afastamentos, corrigir cálculo de datas locais, sobreposição, saldo, lotes, XSS e autenticidade persistida.
5. Lançamento por setor e importações CSV/XLSX com prévia e confirmação.
6. Consolidar dashboard, filtros, alertas e exportações.
7. Testes, RBAC por flag, documentação e execução local com banco disponível.

## Itens necessários para continuar sem inventar dados

1. **DIPE:** contrato da API ou exportação autorizada CSV/JSON; endpoints e exemplos de respostas sem dados pessoais reais (ou dados anonimizados); método de autenticação, escopos, paginação, limites, semântica de atualização/exclusão e regra para mapear registros às unidades/setores de `org.js`. Se a fonte for Supabase, fornecer o desenho autorizado de acesso servidor-servidor/RLS e não uma credencial de usuário pessoal.
2. **Apps Script:** acesso de leitura ao código-fonte/projeto (incluindo `doGet`/`doPost` e bibliotecas) ou exportação completa do código; planilha(s) de origem compartilhadas para leitura, nomes das abas e cabeçalhos; amostras anonimizadas de entrada/saída; procedimento de autenticação e confirmação de quais funções precisam ser portadas. O URL publicado sozinho atualmente exige login institucional.
3. **Férias/escolas:** confirmar se o HTML completo já embutido no DOCX é a versão definitiva do protótipo; informar ou fornecer o cadastro de escolas e como cada diretor se vincula a uma escola/unidade. Credenciais fixas citadas no protótipo devem ser rotacionadas no sistema original.
4. **Autenticação do painel:** confirmar o provedor ou o mecanismo desejado para `AUTH_ENABLED` em produção (por exemplo, identidade institucional/proxy confiável ou login local com hash e sessão), os perfis responsáveis por administrar contas e quais papéis representam Diretoria/Coordenação.

## Estado ao fim da Fase 0

Nenhum arquivo funcional foi alterado e nenhuma sincronização foi executada. Os endpoints e campos das duas fontes externas não foram presumidos. A próxima fase pode começar após receber os contratos/exportações e definições acima; enquanto isso, só seria seguro implementar módulos autônomos que não dependam desses mapeamentos, com conectores externos desativados.
