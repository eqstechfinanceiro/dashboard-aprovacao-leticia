# Tabelas do Banco de Dados — Página de Resultados

## Connection String

```
NEON_DATABASE_URL=postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
```

> **Importante:** Esta connection string já está configurada na variável de ambiente `NEON_DATABASE_URL` no Railway. O app usa o cliente `pg` (Pool) via `lib/neon.ts`, exportando o helper `sql` como tagged template literal.

---

## Visão Geral

Foram criadas 3 tabelas para armazenar os dados reais da página de Resultados (`/resultados`), substituindo os dados mockados atuais. Cada tabela corresponde a uma seção da página:

| Tabela | Seção da Página |
|---|---|
| `resultados_notas` | Entrada de Notas |
| `resultados_fechamentos` | Gestão de Caixa |
| `resultados_conferencias` | Conferências |

---

## Tabela: `resultados_notas`

Armazena cada nota lançada (pelo bot ou manualmente), com valor, tempo de processamento e tipo.

### Esquema

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | SERIAL PRIMARY KEY | auto | ID único |
| `titulo` | VARCHAR(500) | — | Título/descrição da nota (ex: "Nota Fiscal 001 - Material de Escritório") |
| `tipo` | VARCHAR(20) | `'mercadoria'` | Tipo da nota: `mercadoria`, `servico`, ou `agil` |
| `valor` | NUMERIC(12,2) | `0` | Valor da nota em reais |
| `tempo_segundos` | INTEGER | `0` | Tempo total de processamento em segundos |
| `feita_pelo_bot` | BOOLEAN | `false` | `true` se a nota foi lançada pelo bot/automação, `false` se manual |
| `data` | DATE | — | Data da nota (YYYY-MM-DD) |
| `hora` | TIME | NULL | Hora do lançamento (HH:MM:SS) — usado para o gráfico "Notas por Hora" |
| `fonte` | VARCHAR(100) | NULL | Origem do dado (ex: nome da automação, "manual", etc.) |
| `created_at` | TIMESTAMPTZ | `NOW()` | Timestamp de inserção no banco |

### Índices

- `idx_resultados_notas_data` — em `data DESC` (filtro por período)
- `idx_resultados_notas_tipo` — em `tipo` (agrupamento por tipo)
- `idx_resultados_notas_bot` — em `feita_pelo_bot` (separação bot vs manual)
- `idx_resultados_notas_data_hora` — em `(data, hora)` (gráfico por hora)

### Como inserir dados

```sql
INSERT INTO resultados_notas (titulo, tipo, valor, tempo_segundos, feita_pelo_bot, data, hora, fonte)
VALUES (
  'Nota Fiscal 001 - Material de Escritório',
  'mercadoria',
  1250.50,
  45,
  true,
  '2026-08-24',
  '09:30:00',
  'automacao-nf-bot'
);
```

### Via código (Next.js / API route)

```typescript
import { sql } from '@/lib/neon';

await sql`
  INSERT INTO resultados_notas (titulo, tipo, valor, tempo_segundos, feita_pelo_bot, data, hora, fonte)
  VALUES (${titulo}, ${tipo}, ${valor}, ${tempoSegundos}, ${feitaPeloBot}, ${data}, ${hora}, ${fonte})
`;
```

### Dados que a página consome

A página de Resultados usa os seguintes campos desta tabela:

- **totalNotas** — `COUNT(*)`
- **notasBot** — `COUNT(*) WHERE feita_pelo_bot = true`
- **notasManual** — `COUNT(*) WHERE feita_pelo_bot = false`
- **valorTotalNotas** — `SUM(valor)`
- **tempoTotalNotas** — `SUM(tempo_segundos)`
- **tempoMedio** — `AVG(tempo_segundos)`
- **notasPorTipo** — `GROUP BY tipo` (mercadoria, servico, agil)
- **notasPorHora** — `GROUP BY hora` separando bot vs manual
- **Tabela "Notas Lançadas Recentemente"** — lista as notas com titulo, tipo, valor, tempoSegundos, feitaPeloBot

---

## Tabela: `resultados_fechamentos`

Armazena cada fechamento de caixa realizado, com informações sobre duplicidades e reprovações por IA.

### Esquema

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | SERIAL PRIMARY KEY | auto | ID único |
| `responsavel` | VARCHAR(255) | — | Nome de quem fez o fechamento (ex: "Letícia", "Beatriz") |
| `data` | DATE | — | Data do fechamento (YYYY-MM-DD) |
| `aprovado_pela_app` | BOOLEAN | `false` | `true` se o fechamento foi aprovado pela aplicação |
| `despesas_reprovadas_ia` | INTEGER | `0` | Quantidade de despesas reprovadas pela IA |
| `itens_duplicados` | INTEGER | `0` | Quantidade de itens duplicados encontrados |
| `valor_duplicado` | NUMERIC(12,2) | `0` | Valor total dos itens duplicados em reais |
| `fonte` | VARCHAR(100) | NULL | Origem do dado |
| `created_at` | TIMESTAMPTZ | `NOW()` | Timestamp de inserção no banco |

### Índices

- `idx_resultados_fechamentos_data` — em `data DESC`
- `idx_resultados_fechamentos_responsavel` — em `responsavel`
- `idx_resultados_fechamentos_aprovado` — em `aprovado_pela_app`

### Como inserir dados

```sql
INSERT INTO resultados_fechamentos (responsavel, data, aprovado_pela_app, despesas_reprovadas_ia, itens_duplicados, valor_duplicado, fonte)
VALUES (
  'Letícia',
  '2026-08-24',
  true,
  3,
  2,
  450.00,
  'automacao-fechamento'
);
```

### Via código

```typescript
import { sql } from '@/lib/neon';

await sql`
  INSERT INTO resultados_fechamentos (responsavel, data, aprovado_pela_app, despesas_reprovadas_ia, itens_duplicados, valor_duplicado, fonte)
  VALUES (${responsavel}, ${data}, ${aprovadoPelaApp}, ${despesasReprovadasIA}, ${itensDuplicados}, ${valorDuplicado}, ${fonte})
`;
```

### Dados que a página consome

- **totalFechamentos** — `COUNT(*)`
- **fechamentosAprovadosApp** — `COUNT(*) WHERE aprovado_pela_app = true`
- **totalItensDuplicados** — `SUM(itens_duplicados)`
- **totalValorDuplicado** — `SUM(valor_duplicado)`
- **totalDespesasReprovadasIA** — `SUM(despesas_reprovadas_ia)`
- **Fechamentos por Dia** — `GROUP BY data` separando aprovados vs reprovados
- **Resumo de Duplicidades** — lista com responsavel, data, itensDuplicados, valorDuplicado, despesasReprovadasIA

---

## Tabela: `resultados_conferencias`

Armazena conferências de notas que apresentaram erros (tipo errado, valor errado, fornecedor errado).

### Esquema

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | SERIAL PRIMARY KEY | auto | ID único |
| `titulo` | VARCHAR(500) | — | Título/descrição da conferência (ex: "NF 1234 - Serviço classificado como mercadoria") |
| `tipo` | VARCHAR(20) | `'servico'` | Tipo da nota: `servico` ou `mercadoria` |
| `erro` | VARCHAR(50) | `'tipo_errado'` | Tipo do erro: `tipo_errado`, `valor_errado`, ou `fornecedor_errado` |
| `valor` | NUMERIC(12,2) | `0` | Valor da nota com erro em reais |
| `data` | DATE | — | Data da conferência (YYYY-MM-DD) |
| `fonte` | VARCHAR(100) | NULL | Origem do dado |
| `created_at` | TIMESTAMPTZ | `NOW()` | Timestamp de inserção no banco |

### Índices

- `idx_resultados_conferencias_data` — em `data DESC`
- `idx_resultados_conferencias_tipo` — em `tipo`
- `idx_resultados_conferencias_erro` — em `erro`

### Como inserir dados

```sql
INSERT INTO resultados_conferencias (titulo, tipo, erro, valor, data, fonte)
VALUES (
  'NF 1234 - Serviço classificado como mercadoria',
  'servico',
  'tipo_errado',
  890.00,
  '2026-08-24',
  'automacao-conferencia'
);
```

### Via código

```typescript
import { sql } from '@/lib/neon';

await sql`
  INSERT INTO resultados_conferencias (titulo, tipo, erro, valor, data, fonte)
  VALUES (${titulo}, ${tipo}, ${erro}, ${valor}, ${data}, ${fonte})
`;
```

### Dados que a página consome

- **totalConferencias** — `COUNT(*)`
- **valorTotalConferencias** — `SUM(valor)`
- **conferenciasServico** — `COUNT(*) WHERE tipo = 'servico'`
- **conferenciasMercadoria** — `COUNT(*) WHERE tipo = 'mercadoria'`
- **Erros por Tipo** — `GROUP BY erro` (tipo_errado, valor_errado, fornecedor_errado)
- **Lista "Notas com Erro - Detalhes"** — lista com titulo, tipo, erro, valor, data

---

## Query de Exemplo: Buscar dados para a página

Para popular a página de resultados com dados reais, você pode fazer as seguintes queries filtrando por período (hoje, semana, mês):

```typescript
import { sql } from '@/lib/neon';

// Definir intervalo de datas conforme período selecionado
const dataInicio = periodo === 'hoje' ? new Date().toISOString().split('T')[0]
  : periodo === 'semana' ? new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  : new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

// Notas
const notas = await sql`
  SELECT * FROM resultados_notas
  WHERE data >= ${dataInicio}
  ORDER BY data DESC, hora DESC
`;

// Fechamentos
const fechamentos = await sql`
  SELECT * FROM resultados_fechamentos
  WHERE data >= ${dataInicio}
  ORDER BY data DESC
`;

// Conferências
const conferencias = await sql`
  SELECT * FROM resultados_conferencias
  WHERE data >= ${dataInicio}
  ORDER BY data DESC
`;
```

---

## Estrutura no Neon

- **Projeto:** `billowing-dust-36154446`
- **Branch:** `br-damp-shadow-amaqmyis` (main)
- **Database:** `neondb`
- **Host:** `ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech`
- **Região:** `aws-us-east-1`
