# Central de Automação - Dashboard

Dashboard de controle e monitoramento de automações financeiras com backend real e deploy no Vercel.

## 📋 Estrutura do Projeto

```
dashboard-aprovacao-leticia/
├── api/                    # Backend Python (Serverless Functions Vercel)
│   ├── automations.py      # Endpoint para automações
│   ├── sectors.py         # Endpoint para setores
│   ├── timeline.py        # Endpoint para timeline
│   ├── kpis.py            # Endpoint para KPIs
│   └── chart_data.py      # Endpoint para dados de gráficos
├── database/
│   └── schema.sql         # Schema SQL para banco Neon
├── static/
│   ├── css/
│   │   └── styles.css     # Estilos CSS
│   └── js/
│       └── app.js         # JavaScript frontend
├── components/            # Componentes compartilhados
├── pages/                 # Páginas HTML separadas
├── index.html             # Página principal
├── requirements.txt       # Dependências Python
└── vercel.json           # Configuração Vercel
```

## 🚀 Setup Local

### 1. Configurar Banco de Dados Neon

1. Crie uma conta em [Neon](https://neon.tech)
2. Crie um novo projeto PostgreSQL
3. Copie a connection string (DATABASE_URL)
4. Execute o schema.sql no banco:

```bash
psql $DATABASE_URL -f database/schema.sql
```

Ou use o Neon Console SQL Editor para executar o conteúdo de `database/schema.sql`.

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

### 3. Instalar Dependências

```bash
pip install -r requirements.txt
```

### 4. Testar Localmente (Opcional)

Para testar o backend localmente, você pode usar um servidor HTTP simples:

```bash
python -m http.server 8000
```

Acesse: `http://localhost:8000`

## 📦 Deploy no Vercel

⚠️ **Nota:** O Vercel CLI pode apresentar erros em alguns ambientes. Se o comando `vercel` falhar, use a interface web do Vercel.

### Via Interface Web (Recomendado)

1. Acesse: https://vercel.com/new
2. Clique em "Add New Project"
3. Se tiver o projeto no GitHub:
   - Importe o repositório
   - Configure o nome: `centraleqstech`
4. Se não tiver no GitHub:
   - Clique em "Upload a folder"
   - Selecione o diretório `dashboard-aprovacao-leticia`
5. Configure:
   - **Project Name:** `centraleqstech`
   - **Environment Variables:** Adicione `DATABASE_URL`:
     ```
     postgresql://neondb_owner:npg_HRTpxwemQ40Y@ep-patient-shadow-acgn0exr-pooler.sa-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
     ```
6. Clique em "Deploy"

### Via CLI (Se funcionar)

1. Configurar Variáveis de Ambiente:

```bash
vercel env add DATABASE_URL
```

Cole a connection string do Neon quando solicitado.

2. Deploy:

```bash
vercel
```

3. Deploy de Produção:

```bash
vercel --prod
```

## 🔧 Endpoints API

Todos os endpoints estão em `/api/`:

- `GET /api/automations` - Lista todas as automações
- `PUT /api/automations/{id}` - Atualiza automação (running, runtime)
- `GET /api/sectors` - Lista todos os setores
- `GET /api/timeline` - Lista timeline com ações
- `GET /api/kpis` - Lista KPIs
- `GET /api/chart_data` - Lista dados de gráficos por período

## 🗄️ Schema do Banco

O banco PostgreSQL contém as seguintes tabelas:

- `sectors` - Setores das automações
- `automations` - Automações com status e métricas
- `timeline` - Timeline de atualizações
- `timeline_actions` - Ações de cada item da timeline
- `chart_data` - Dados para gráficos por período
- `kpis` - Indicadores chave de performance

## 📝 Notas Importantes

- O backend usa serverless functions do Vercel com Python
- As APIs retornam JSON com CORS habilitado
- O frontend carrega dados automaticamente na inicialização
- Se a API falhar, há fallback para dados mockados no console
- Os timers das automações são mantidos no frontend (não persistem no banco)

## 🐛 Troubleshooting

### Erro de conexão com banco
- Verifique se a DATABASE_URL está correta
- Verifique se o banco Neon está ativo
- Certifique-se de que o schema foi executado

### API retornando 404
- Verifique se os arquivos em api/ estão na estrutura correta
- Verifique se o vercel.json está configurado corretamente

### Gráficos não carregam
- Verifique se o Chart.js está carregando (ver console)
- Verifique se os dados da API estão retornando corretamente

## 📄 Licença

Projeto interno para controle de automações financeiras.

---
**Última atualização:** 20/05/2026 - Análise de planilhas e API VExpenses concluída
