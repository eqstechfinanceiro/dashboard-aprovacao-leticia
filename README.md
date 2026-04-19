# dashboard-aprovacao-leticia

Dashboard de aprovação de despesas (Letícia / EQS) consumindo a API pública do [VExpenses v2](https://developers.vexpenses.com/v2/).

## Documentação

- [`docs/API-VExpenses.md`](./docs/API-VExpenses.md) — catálogo completo das rotas da API VExpenses, status de cada rota (testada vs. apenas especificada), schemas de resposta e exemplos reais capturados da conta EQS.

Esta doc é o insumo para construir o dashboard. Consulte-a antes de adicionar qualquer nova tela/endpoint.

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `VEXPENSES_TOKEN` | Token da API pública VExpenses (header `Authorization`, sem prefixo `Bearer`). |

Nunca commite o token no repositório — use `.env` local e, em produção, o secret manager do provedor de deploy.
