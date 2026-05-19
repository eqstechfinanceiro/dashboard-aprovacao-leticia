# vExpenses Dashboard

Dashboard para gestão de despesas corporativas usando a API vExpenses v2.

## Stack Tecnológica

- **Frontend**: Next.js 14+ com App Router e TypeScript
- **Styling**: TailwindCSS
- **UI Components**: shadcn/ui
- **Gráficos**: Recharts
- **HTTP Client**: Axios
- **Ícones**: Lucide React

## Pré-requisitos

- Node.js 18+ instalado
- API Key da vExpenses

## Instalação

1. Clone o repositório e entre na pasta do projeto:
```bash
cd vexpenses-dashboard
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Edite o arquivo `.env` e adicione sua API Key:
```env
NEXT_PUBLIC_API_URL=https://api.vexpenses.com
VEXPENSES_API_KEY=sua_api_key_aqui
```

## Rodar o Projeto

### Modo Desenvolvimento
```bash
npm run dev
```

Acesse: http://localhost:3000

### Build para Produção
```bash
npm run build
npm start
```

## Estrutura do Projeto

```
vexpenses-dashboard/
├── app/
│   ├── globals.css       # Estilos globais com Tailwind
│   ├── layout.tsx        # Layout principal
│   └── page.tsx          # Página inicial (dashboard)
├── components/
│   └── ui/               # Componentes shadcn/ui
├── lib/
│   ├── api.ts            # Serviço da API vExpenses
│   └── utils.ts          # Funções utilitárias
├── public/               # Arquivos estáticos
├── package.json          # Dependências
├── tsconfig.json         # Configuração TypeScript
├── tailwind.config.ts    # Configuração TailwindCSS
└── next.config.js        # Configuração Next.js
```

## Página de Teste

A página inicial (`app/page.tsx`) é uma página de teste que mostra:

- **Cards de Resumo**: Total de despesas, relatórios, membros e centros de custo
- **Valor Total**: Soma de todas as despesas
- **Tabela de Despesas**: Últimas 10 despesas com detalhes
- **Tabela de Relatórios**: Últimos 10 relatórios com status
- **Tipos de Despesa**: Lista dos tipos disponíveis
- **Centros de Custo**: Lista dos centros disponíveis

Esta página serve para validar a conexão com a API e visualizar os dados retornados.

## Próximos Passos

1. Adicionar componentes shadcn/ui necessários
2. Criar páginas do dashboard (aprovação, despesas, analytics, etc.)
3. Implementar gráficos com Recharts
4. Adicionar filtros e paginação
5. Implementar autenticação
6. Testes E2E

## Documentação da API

- [API_ROUTES.md](../API_ROUTES.md) - Documentação completa das rotas da API
- [PLANO_PAGINAS.md](../PLANO_PAGINAS.md) - Plano detalhado das páginas

## Suporte

Para dúvidas sobre a API vExpenses, consulte a documentação oficial: https://developers.vexpenses.com/v2/
