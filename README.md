# dashboard-aprovacao-leticia

Dashboard financeiro e de aprovações da EQS consumindo a API pública do [VExpenses v2](https://developers.vexpenses.com/v2/), persistindo estado local no **Neon Postgres** via **Drizzle ORM**, entregue com **Next.js 14 + shadcn/ui** em **Vercel**.

## Documentação

- [`docs/API-VExpenses.md`](./docs/API-VExpenses.md) — catálogo das rotas da API VExpenses, schemas e exemplos reais da conta EQS.
- [`docs/PLAN-Dashboard.md`](./docs/PLAN-Dashboard.md) — blueprint completo do dashboard (stack, 11 abas, IA consultora, roadmap).
- [`docs/Cash-Balance-Calculation.md`](./docs/Cash-Balance-Calculation.md) — fórmula do saldo de caixa por colaborador (DEVEDOR/QUITADO/CREDOR).

## Stack

- Next.js 14 (App Router, React Server Components, Route Handlers)
- TypeScript 5
- Tailwind CSS 3 + shadcn/ui + Lucide + Radix UI
- Recharts (gráficos) · TanStack Query (cache client-side) · Sonner (toasts)
- Drizzle ORM + `@neondatabase/serverless`
- date-fns (pt-BR), Zod, react-hook-form

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `VEXPENSES_TOKEN` | Sim | Token da API VExpenses (header `Authorization`, **sem** `Bearer`). Usado apenas no servidor. |
| `DATABASE_URL` | Sim | Connection string do Neon Postgres (pooled). |
| `ENABLE_WRITES` | Não | `"true"` libera aprovar/reprovar/pagar/adiantar na API real. Começa desligado. |

**Nunca commite** esses valores no git — em produção use a aba Settings → Environment Variables na Vercel.

## Rodando localmente

```bash
pnpm install       # ou npm install
cp .env.example .env.local
# preencher VEXPENSES_TOKEN e DATABASE_URL

# criar schema no Neon (1a vez)
pnpm db:push       # ou npm run db:push

pnpm dev           # http://localhost:3000
```

Para gerar arquivos de migração formais (ao invés do push direto): `pnpm db:generate`.

## Deploy na Vercel

1. Importe o repositório no painel da Vercel.
2. Em **Settings → Environment Variables** defina `VEXPENSES_TOKEN` e `DATABASE_URL` para os três ambientes (Production/Preview/Development).
3. (Opcional) Defina `ENABLE_WRITES=true` apenas em Production quando estiver pronto para acionar a API real do VExpenses.
4. O `vercel.json` já ajusta região para `gru1` (São Paulo) e desliga cache em rotas `/api/*`.
5. Antes do primeiro deploy, rode `pnpm db:push` contra o Neon para criar o schema.

## Estrutura

```
src/
├── app/
│   ├── (app)/            # shell autenticável (layout com sidebar/topbar)
│   │   ├── page.tsx               # Visão geral
│   │   ├── aprovacoes/            # Fila + aprovação em lote
│   │   ├── relatorios/            # Lista + detalhe com abas
│   │   ├── despesas/              # Itens + galeria de comprovantes
│   │   ├── caixa/                 # Saldo por colaborador + liberar adiantamento
│   │   ├── colaboradores/         # Lista + detalhe
│   │   ├── centros-custo/
│   │   ├── projetos/
│   │   ├── analises/              # SLA, tempo de aprovação, curva ABC
│   │   ├── ia/                    # IA Consultora (regras + chat)
│   │   └── configuracoes/         # Token status, auditoria, flags
│   └── api/                  # Route handlers para writes + IA
├── components/
│   ├── ui/                   # shadcn/ui primitives
│   ├── layout/               # Sidebar, Topbar, PageHeader
│   ├── shared/               # KpiCard, StatusBadge, Charts, WriteFlagBanner
│   ├── reports/              # Tabela, filtros, ações de aprovação
│   ├── cash/                 # AdvanceButton (modal de liberar caixa)
│   └── ai/                   # RulesManager, AdviceChat
├── db/                    # Drizzle schema + client
│   └── schema.ts
├── lib/
│   ├── vexpenses.ts          # Cliente server-only da API VExpenses
│   ├── analytics.ts          # Agregações (KPIs, ABC, tempo de aprovação)
│   ├── cash-balance.ts       # Cálculo DEVEDOR/QUITADO/CREDOR
│   ├── format.ts             # Formatação pt-BR (BRL, datas, etc)
│   └── api-errors.ts
└── types/
    └── vexpenses.ts          # Tipos derivados da documentação da API
```

## Segurança

- `VEXPENSES_TOKEN` vive **só no servidor** (Server Components, Route Handlers). Nenhuma chamada direta do browser.
- Escritas na API VExpenses (approve/reject/reopen/pay/advances) são bloqueadas até você definir `ENABLE_WRITES=true`. Há banner visual na UI enquanto a flag está desligada.
- Todas as ações de escrita são registradas em `audit_log` no Neon.

## Roadmap pós-MVP

- NextAuth com Google Workspace da EQS (SSO).
- Job agendado (Vercel Cron) recomputando `balance_snapshots` a cada 5 min.
- Motor de execução das regras da IA Consultora (hoje as regras são cadastradas, mas ainda não agendam execução automática).
- Integração com LLM (OpenAI/Anthropic) no chat da IA — hoje as respostas são determinísticas.
