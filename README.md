# dashboard-aprovacao-leticia

Dashboard financeiro e de aprovações da EQS consumindo a API pública do [VExpenses v2](https://developers.vexpenses.com/v2/), persistindo estado local no **Neon Postgres** via **Drizzle ORM**, entregue com **Next.js 14 + shadcn/ui**. Projetado para **rodar 100% local** (ou em qualquer host gratuito que aceite Next.js) — nenhum fornecedor pago é obrigatório.

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
- Auth single-user via cookie HMAC-SHA256 (Web Crypto — sem dependência externa)

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `VEXPENSES_TOKEN` | Sim | Token da API VExpenses (header `Authorization`, **sem** `Bearer`). Usado apenas no servidor. |
| `DATABASE_URL` | Sim | Connection string do Neon Postgres (pooled). O tier grátis do Neon é suficiente. |
| `ENABLE_WRITES` | Não | `"true"` libera aprovar/reprovar/pagar/adiantar na API real. Começa desligado. |
| `APP_USER` | Sim (prod) | Usuário do login básico. Default local: `admin`. |
| `APP_PASSWORD` | Sim (prod) | Senha do login básico. Default local: `admin`. |
| `APP_SESSION_SECRET` | Sim (prod) | String aleatória usada para assinar o cookie de sessão. Gere com `openssl rand -hex 32`. |

**Nunca commite** esses valores no git. Se um deles faltar, o app cai em valores padrão inseguros e mostra um aviso no login — isso é aceitável para desenvolvimento local, não para produção.

## Rodando localmente (100% grátis)

Pré-requisitos: Node.js 20+ e uma conta grátis no [Neon](https://neon.tech) para o Postgres.

```bash
git clone https://github.com/eqstechfinanceiro/dashboard-aprovacao-leticia.git
cd dashboard-aprovacao-leticia

npm install
cp .env.example .env.local
# editar .env.local com VEXPENSES_TOKEN, DATABASE_URL do Neon,
# APP_USER, APP_PASSWORD e APP_SESSION_SECRET.

# criar schema no Neon (1a vez)
npm run db:push

npm run dev                 # http://localhost:3000
# primeira tela: /login (use o APP_USER/APP_PASSWORD configurados)
```

Para gerar arquivos de migração formais (ao invés do push direto): `npm run db:generate`.

## Login

O dashboard é single-user: apenas quem souber `APP_USER` / `APP_PASSWORD` consegue entrar. O middleware (`src/middleware.ts`) guarda todas as rotas que não são `/login` ou `/api/auth/*`; APIs retornam `401` para requests sem sessão válida. O botão **Sair** no menu do topo destrói a sessão.

Para trocar credenciais, edite o `.env.local`, salve e reinicie o servidor (`npm run dev`) — a próxima visita vai exigir login com as novas credenciais.

## Opções de hospedagem grátis

Se em algum momento quiser deixar o app acessível fora da sua máquina sem pagar:

- **Local + túnel**: rode `npm run dev` e exponha com `cloudflared tunnel --url http://localhost:3000` (Cloudflare Tunnel grátis).
- **Cloudflare Pages** / **Netlify** / **Railway trial** / **Render free**: qualquer um roda Next.js 14. Configure as mesmas env vars e o mesmo `DATABASE_URL`.
- **Vercel** (não obrigatório): se quiser, o projeto já tem `vercel.json` pré-ajustado com região `gru1` (SP) e cache desligado em `/api/*`.

## Estrutura

```
src/
├── middleware.ts              # guard de sessão (Edge runtime)
├── app/
│   ├── login/                 # tela de login single-user
│   ├── (app)/                 # shell autenticado (layout com sidebar/topbar)
│   │   ├── page.tsx           # Visão geral
│   │   ├── aprovacoes/        # Fila + aprovação em lote
│   │   ├── relatorios/        # Lista + detalhe com abas + export CSV
│   │   ├── despesas/          # Itens + galeria de comprovantes
│   │   ├── caixa/             # Saldo por colaborador + liberar adiantamento
│   │   ├── colaboradores/     # Lista + detalhe
│   │   ├── centros-custo/
│   │   ├── projetos/
│   │   ├── analises/          # SLA, tempo de aprovação, curva ABC
│   │   ├── ia/                # Recomendações + regras + chat
│   │   └── configuracoes/     # Status token/db, sessão, auditoria, flags
│   └── api/                   # Route handlers
│       ├── auth/login,logout  # basic auth + cookie HMAC
│       ├── advances/          # criação de adiantamento (gatear DEVEDOR)
│       ├── ai/chat,advice     # chat determinístico + motor de recomendações
│       └── export/reports,audit  # download CSV
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── layout/                # Sidebar, Topbar (com logout), PageHeader
│   ├── shared/                # KpiCard, StatusBadge, WriteFlagBanner
│   ├── reports/               # Tabela, filtros, ações de aprovação
│   ├── cash/                  # AdvanceButton (modal de liberar caixa)
│   └── ai/                    # AdviceCards, RulesManager, AdviceChat
├── db/                        # Drizzle schema + client
│   └── schema.ts
├── lib/
│   ├── auth.ts                # HMAC session (Web Crypto, sem deps)
│   ├── vexpenses.ts           # Cliente server-only da API (retry + paginação)
│   ├── analytics.ts           # Agregações (KPIs, ABC, tempo de aprovação)
│   ├── cash-balance.ts        # Cálculo DEVEDOR/QUITADO/CREDOR
│   ├── ai-advice.ts           # Motor de recomendações (regras programadas)
│   ├── format.ts              # Formatação pt-BR (BRL, datas, etc)
│   └── api-errors.ts
└── types/
    └── vexpenses.ts           # Tipos derivados da documentação da API
```

## Segurança

- `VEXPENSES_TOKEN` vive **só no servidor** (Server Components, Route Handlers). Nunca chega no browser.
- Escritas na API VExpenses (approve/reject/reopen/pay/advances) ficam bloqueadas até você definir `ENABLE_WRITES=true`. Há banner visual em todas as telas de ação enquanto a flag está desligada.
- Todas as ações de escrita são registradas em `audit_log` no Neon.
- Cookie de sessão é HttpOnly, SameSite=Lax, Secure em produção, assinado com HMAC-SHA256 (`APP_SESSION_SECRET`).

## IA Consultora (sem LLM)

A aba **IA** roda três componentes:

1. **Recomendações** — motor de regras programadas em `src/lib/ai-advice.ts`. Cada regra é uma função pura sobre os dados (relatórios + saldos) que devolve um card com severidade (`critical` / `warning` / `info` / `success`). Regras atuais:
   - DEVEDOR há 30+ dias
   - CREDOR ≥ R$ 1.000 (prioridade de pagamento)
   - Pendente em aprovação há 7+ dias
   - Pendente ≥ R$ 5.000
   - Setor com tempo médio ≥ 7 dias
   - Despesa reembolsável sem comprovante
   - Concentração de 1 centro de custo > 50%
   - Taxa de rejeição ≥ 15% em 30 dias
   - Elegíveis para aprovação rápida (≤ R$ 500, colaborador não DEVEDOR, 2+ dias na fila)
2. **Regras programadas** — CRUD de regras persistidas no Neon (placeholder para automação futura).
3. **Chat contextual** — respostas determinísticas por keyword (reembolso / setor / aprovar / centro de custo / top colaboradores / recomendações). Zero LLM, zero custo.

## Roadmap

- Motor de execução das regras no-code (hoje as regras são cadastradas mas não agendam ação).
- Aprovação em lote com pré-validação de saldo.
- Polir página de detalhe `/relatorios/[id]` (galeria de comprovantes, rateio por CC).
- Substituir chat determinístico por LLM (opcional).
