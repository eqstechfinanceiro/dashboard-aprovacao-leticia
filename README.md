# Dashboard VExpenses

Dashboard de controle financeiro integrado com a API VExpenses, com backend Python para verificação de planilhas e frontend Next.js.

## Estrutura do Projeto

```
dashboard-test/
├── controle-api/               # Backend Python (FastAPI)
│   ├── src/                    # Código-fonte principal
│   │   ├── server.py           # Servidor FastAPI (porta 8000)
│   │   ├── verifier.py         # Executor de verificações
│   │   ├── api_client.py       # Cliente da API VExpenses
│   │   ├── gerar_carga_qz.py   # Gerador de carga quinzenal
│   │   └── checks/             # Módulos de verificação por planilha
│   ├── data/                   # Banco SQLite e arquivos de dados
│   ├── docs/                   # Documentação de endpoints e mapeamentos
│   ├── temp/                   # Scripts de análise e investigação (one-off)
│   ├── requirements.txt        # Dependências Python
│   └── .env                    # Variáveis de ambiente (API keys)
│
├── vexpenses-dashboard/        # Frontend Next.js
│   ├── app/                    # Rotas e páginas (App Router)
│   │   ├── api/                # API routes (proxy VExpenses + cache)
│   │   ├── despesas/           # Página de despesas
│   │   ├── aprovacoes/         # Página de aprovações
│   │   ├── gestao-caixa/       # Gestão de caixa
│   │   ├── status-caixa/       # Status do caixa
│   │   └── quinzena-dinamica/  # Quinzena dinâmica
│   ├── components/             # Componentes React
│   ├── lib/                    # Utilitários (API, cache, cálculos)
│   ├── docs/                   # Documentação e análises do frontend
│   └── scripts/                # Scripts de análise e investigação (one-off)
│
└── docs/                       # Documentação e notas de investigação da raiz
```

## Setup Local

### Backend (controle-api)

```bash
cd controle-api
pip install -r requirements.txt
python src/server.py
# Acesse: http://localhost:8000
```

### Frontend (vexpenses-dashboard)

```bash
cd vexpenses-dashboard
npm install
npm run dev
# Acesse: http://localhost:3000
```

## Variáveis de Ambiente

### controle-api/.env
```env
VEXPENSES_API_KEY=...
VEXPENSES_ACCOUNT_ID=...
```

### vexpenses-dashboard/.env
```env
VEXPENSES_API_KEY=...
NEON_DATABASE_URL=...
```

## Endpoints do Backend (porta 8000)

- `GET /api/sheets` - Lista planilhas e colunas do banco SQLite
- `GET /api/sheets/{table}/data` - Dados paginados de uma tabela
- `GET /api/health` - Status do servidor e banco
- `GET /api/verify/tables` - Tabelas com checks definidos
- `GET /api/sheets/mapping-status` - Status de mapeamento por tabela
- `GET /api/verify/{table}` - Executa verificações de uma tabela

## Deploy

O frontend é deployado no Vercel/Railway. Ver `vexpenses-dashboard/vercel.json` e `vexpenses-dashboard/railway.json`.

---
**Última atualização:** 2026-06-15
