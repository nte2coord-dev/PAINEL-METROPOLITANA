# Painel de Gestão – SRE Metropolitana A (SEE/MG)

Dashboard de acompanhamento de demandas, pendências, prazos e indicadores por unidade e setor
(estrutura do Decreto nº 48.709/2023). Node.js + Express, PostgreSQL, front-end em JavaScript puro (sem build).

> O arquivo `painel-metropolitana.zip` na raiz é de um projeto anterior (portal de atalhos) e não faz parte deste sistema.

## Rodar localmente
```bash
npm install
export DATABASE_URL=postgres://usuario@localhost:5432/painel
SEED_DEMO=true ADMIN_PASSWORD='TroqueEsta1' npm start   # http://localhost:3000
```
`SEED_DEMO=true` cria dados fictícios e usuários demo (senha `Painel@2026`, ex.: `superintendente@educacao.mg.gov.br`,
`diretor.dipe@educacao.mg.gov.br`, `coord1@educacao.mg.gov.br`). **Nunca use em produção.**

## Deploy no Render
1. Render › New › **Blueprint** › selecione este repositório (usa `render.yaml`: web service + PostgreSQL).
2. Preencha `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `PUBLIC_URL`. O schema e a estrutura de unidades/setores são criados na primeira inicialização.
3. Entre como admin e cadastre usuários em *Administração*.
Observação: o Postgres "free" do Render expira em 30 dias; o `render.yaml` usa plano pago.

## Importar a planilha de contatos
A planilha `Contatos_e_Ramais.xlsx` **não chegou anexa** à conversa; o seed atual usa os setores citados no prompt (sem ramais).
Quando tiver o arquivo: `DATABASE_URL=... npm run import:contatos -- Contatos_e_Ramais.xlsx`
(separa múltiplos ramais/e-mails, agrupa linhas duplicadas, trata Inspeção e NTE como coordenações independentes).
Os nomes de coluna esperados estão no topo de `src/import-contatos.js` — ajuste se diferirem.

## Perfis (RBAC)
| Perfil | Acesso |
|---|---|
| Superintendente | Vê tudo, envia alertas, relatórios, lê usuários/auditoria |
| Diretor | Vê sua unidade, alerta/comenta nos setores dela |
| Coord. de setor | Vê e lança/edita somente o seu setor |
| Administrador | Cadastros, usuários, parâmetros, contatos |

Login só com `@educacao.mg.gov.br` (`ALLOWED_EMAIL_DOMAIN`), senha com bcrypt, cookie httpOnly, limite de tentativas,
auditoria de todos os lançamentos (`audit_log`). Recuperação de senha: sem SMTP, o link é escrito no log do servidor.

## Suposições (configuráveis)
- "Vence em breve" = ≤ 3 dias (Administração › Parâmetros). Status de prazo é sempre calculado pelo sistema.
- "Pendentes" = demandas não concluídas/canceladas. "Fora do prazo" = vencidas e não concluídas.
- Tendência = % no prazo das demandas entradas nos últimos 30 dias vs. 30 dias anteriores.
- Setores partem dos exemplos do prompt; edite/adicione pela interface.

## Estado e próximos passos
Implementado: login/RBAC/auditoria, visão geral e por unidade, setor (demandas, pendências, consolidado, indicadores),
linha do tempo, alertas, contatos, busca global, relatórios CSV/PDF, importação CSV, tema claro/escuro.
Pendente: importação XLSX de demandas, anexos, envio de e-mail (SMTP), alertas automáticos de vencimento, testes automatizados, valores históricos de indicadores.
