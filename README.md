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

## ⚠️ Sem login (fase de desenvolvimento)
Não há login, senha nem usuários: **quem abrir o endereço tem acesso total** (ver, criar, editar e apagar), como o usuário
"Administrador" do sistema. Não coloque dados reais/sensíveis enquanto estiver assim, ou proteja o acesso por fora
(ex.: restringir por rede/IP ou colocar o serviço atrás de um proxy com autenticação). O código de perfis (RBAC) segue no
projeto, inativo, para quando o acesso restrito voltar.

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
linha do tempo, alertas, contatos, busca global, relatórios CSV/PDF, importação CSV, tema claro/escuro.
Pendente: importação XLSX de demandas, anexos, envio de e-mail (SMTP), alertas automáticos de vencimento, testes automatizados, valores históricos de indicadores.
