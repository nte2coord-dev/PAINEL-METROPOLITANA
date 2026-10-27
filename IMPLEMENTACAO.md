# Implementação — Painel SRE Metropolitana A

## Entregue nesta etapa

- Migrações PostgreSQL versionadas e idempotentes para escolas, diretores, férias, lotes, afastamentos, autenticação, códigos de autenticidade, staging bruto, pendências e logs de integração.
- Regras servidoras para férias: 60 dias corridos, seis períodos, contagem inclusiva, validação de datas, saldo e não sobreposição. Lotes aplicam/edita/removem períodos respeitando as regras por diretor. Afastamentos não consomem o saldo e contam dias úteis, excluindo fins de semana e feriados informados.
- Telas SPA para escolas, diretores, férias, afastamentos, lotes, extratos e administração da saúde das integrações.
- Portal público de férias somente leitura e páginas imprimíveis de extrato individual/relatório geral. O público recebe apenas nome do diretor, escola, períodos e saldo; códigos de autenticidade são persistidos e verificáveis. Links de Drive e afastamentos ficam privados.
- Autenticação opcional por `AUTH_ENABLED`, sessões opacas com tokens armazenados por hash, senha `scrypt`, cookie `HttpOnly`/`SameSite=Strict`, bootstrap administrativo por variáveis de ambiente e gestão básica de usuários protegida por admin. O Blueprint do Render agora exige a configuração do segredo antes de inicializar com autenticação.
- Interfaces para normalizar/upsert de dados, upsert idempotente com chave fonte/ID externo, staging JSONB, processamento isolado por item e fila de rejeições.

## Verificações realizadas

- `npm test`: 9 testes unitários passaram; o teste PostgreSQL condicional é executado quando `TEST_DATABASE_URL` é informado.
- Execução com `TEST_DATABASE_URL` contra PostgreSQL local: 10/10 testes passaram, incluindo upsert idempotente e staging com item rejeitado sem interromper o lote.
- Inicialização local do servidor e aplicação das migrações `001` e `002` confirmadas.
- Testados via HTTP local: sessão sem login → 401 em modo autenticado; login → 200; logout → 401; criação de escola/diretor; inclusão de férias; conflito de sobreposição → 400; afastamento com feriado → dias úteis corretos; extrato e relatório geral com autenticidade válida; lote criado, editado e removido.
- Verificados por `node --check` os arquivos de servidor, rotas, integrações e interface.

## Limites e decisões explícitas

- Nenhuma conexão foi feita ao Portal DIPE. O usuário pediu para não conectar agora. O Apps Script indicado redireciona para login institucional; não foram tentadas credenciais nem leitura de dados. Ambos os conectores permanecem inativos, sem scraping ou sincronização agendada.
- Para ativar integração real ainda são necessários autorização e contrato de acesso, acesso legítimo ao código/schema das fontes, amostras anonimizadas, mapeamento de campos e regras de reconciliação. Somente depois disso se implementam adaptadores e agenda.
- A importação CSV existente não foi convertida nesta etapa em uma tela de prévia/reconciliação CSV/XLSX. Anexos binários, e-mail SMTP, alertas automáticos de vencimento e séries históricas de indicadores também permanecem pendentes.
- Não houve publicação ou push para GitHub/Render. A alteração do `render.yaml` é apenas configuração do repositório; credenciais de produção precisam ser inseridas diretamente como secrets no Render.
- `npm audit fix` corrigiu a vulnerabilidade alta de `body-parser`. Permanecem dois avisos moderados transitivos de `uuid` via `exceljs`; a resolução automática exigiria downgrade forçado do ExcelJS, por isso não foi aplicada uma atualização potencialmente incompatível.

## Rodar localmente

1. Instale Node.js 20+ e PostgreSQL; crie um banco e configure `DATABASE_URL`.
2. Execute `npm ci` e `npm test`.
3. Inicie com `DATABASE_URL='postgresql://...' npm start`.
4. O modo local não autenticado é apenas para desenvolvimento. Para testar proteção: defina `AUTH_ENABLED=true`, `AUTH_ADMIN_EMAIL` e `AUTH_ADMIN_PASSWORD` (mínimo 12 caracteres).
