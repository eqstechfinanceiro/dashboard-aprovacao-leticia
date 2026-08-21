# Quinzena-Complete API — Full Handoff Document

> **Purpose:** Everything an AI needs to know about how to call the API, what data it returns, and in what format. No assumptions, no prior decisions — just the contract and the business rules from the Excel reference sheets.

---

## 1. Endpoint

```
GET /api/quinzena-complete
```

### Query Parameters

| Parameter   | Type    | Required | Default | Description                                      |
|-------------|---------|----------|---------|--------------------------------------------------|
| `year`      | integer | No       | `2026`  | Year (e.g. 2026)                                 |
| `month`     | integer | No       | `5`     | Month 1–12                                       |
| `quinzena`  | integer | No       | `1`     | Quinzena: `1` (days 26→10) or `2` (days 11→25)   |

### Example Call

```
GET http://localhost:3000/api/quinzena-complete?year=2026&month=6&quinzena=1
```

---

## 2. POST Endpoint (Save Manual Inputs)

```
POST /api/quinzena-complete
Content-Type: application/json
```

### Request Body

```json
{
  "cpf": "02027745203",
  "year": 2026,
  "month": 6,
  "quinzena": 1,
  "field": "col_1qz",
  "value": 5000
}
```

### Allowed Fields

| Field           | Value Type          | Description                          |
|-----------------|---------------------|--------------------------------------|
| `col_1qz`       | number or null      | Manual col_qz value (1ª quinzena)    |
| `adiantamento`  | number or null      | Manual adiantamento value            |
| `obs`           | string or null      | Observation text                     |

### Response

```json
{ "ok": true }
```

---

## 3. Response Format (GET)

### Top-Level Structure

```typescript
interface QuinzenaResponse {
  data_mode: 'snapshot' | 'calculado';
  reembolso_multiplier: number;
  period: {
    year: number;
    month: number;
    quinzena: number;
    start_date: string;    // e.g. "2026-05-26"
    end_date: string;      // e.g. "2026-06-10"
    month_name: string;    // e.g. "Junho"
  };
  statistics: {
    total_rows: number;
    ativos: number;
    com_carga: number;
    total_carga_final: number;
    total_saldo_final: number;
    total_col_qz: number;
    has_neon_data: boolean;
  };
  data: QuinzenaRow[];
}
```

### `data_mode`

| Value         | Meaning                                                                 |
|---------------|-------------------------------------------------------------------------|
| `"snapshot"`  | Pre-imported data from Excel sheets exists in DB for this period        |
| `"calculado"` | No snapshot exists — API computes everything from raw transaction data  |

### QuinzenaRow — Each Row in `data[]`

```typescript
interface QuinzenaRow {
  // --- Identificação ---
  cpf: string;              // CPF with leading zeros, 11 digits
  colaborador: string;      // Full name
  situacao: string;         // "ATIVO", "FERIAS", etc.
  status_cartao: string;    // "Cartão ativo", "Cartão pendente", etc.
  regional: string;
  centro_custo: string;
  gestor: string;
  diretor: string;

  // --- Saldos (exibição) ---
  saldo_final: number;       // Pode ser negativo
  saldo_cartao: number;      // Saldo do cartão VExpenses
  saldo_prestacao: number;   // Saldo da prestação de contas

  // --- Saldos (usados nas fórmulas) ---
  col_qz: number | null;     // Col_qz da planilha (null em modo calculado)
  saldo_reembolsar: number;  // max(-saldo_final, 0) — quanto deve ser reembolsado
  saldo_final_carga: number; // max(saldo_final, 0) — usado na fórmula carga_parcial
  saldo_cartao_carga: number;// saldo_cartao usado na fórmula

  // --- Manuais ---
  col_qz_manual: number | null;  // Input manual do usuário (sobrescreve col_qz)
  adiantamento: number;          // Input manual (default 0)
  obs: string | null;            // Observação manual

  // --- Calculados ---
  carga_parcial: number;
  reembolso: number;
  carga_final: number;

  // --- Metadata ---
  data_sources: {
    col_qz: 'planilha' | 'manual' | 'null';
    saldo_final: 'neon';
    saldo_cartao: 'neon';
    adiantamento: 'manual' | 'default';
  };
  _data_source: 'snapshot' | 'calculado';
}
```

### Example JSON Response (single row)

```json
{
  "cpf": "02027745203",
  "colaborador": "ABNER ANDRADE CAVALCANTE",
  "situacao": "ATIVO",
  "status_cartao": "Cartão ativo",
  "regional": "CEF AM AC RR",
  "centro_custo": "CEF AM AC RR",
  "gestor": "ANGELICA SOARES",
  "diretor": "ROGERIO SCATAMBULO",
  "saldo_final": -5300.54,
  "saldo_cartao": 20,
  "saldo_prestacao": -5280.54,
  "col_qz": null,
  "saldo_reembolsar": 5300.54,
  "saldo_final_carga": 0,
  "saldo_cartao_carga": 20,
  "col_qz_manual": 9840,
  "adiantamento": 0,
  "obs": null,
  "carga_parcial": 9820,
  "reembolso": 0,
  "carga_final": 9820,
  "data_sources": {
    "col_qz": "manual",
    "saldo_final": "neon",
    "saldo_cartao": "neon",
    "adiantamento": "default"
  },
  "_data_source": "calculado"
}
```

---

## 4. Quinzena Date Rules

```
1ª QZ (quinzena=1): 26 do mês anterior → 10 do mês atual (fechamento dia 10)
2ª QZ (quinzena=2): 11 do mês atual → 25 do mês atual (fechamento dia 25)
```

### Concrete date examples for 2026:

| Month | QZ | start_date  | end_date    |
|-------|----|-------------|-------------|
| Jan   | 1  | 2025-12-26  | 2026-01-10  |
| Jan   | 2  | 2026-01-11  | 2026-01-25  |
| Feb   | 1  | 2026-01-26  | 2026-02-10  |
| Feb   | 2  | 2026-02-11  | 2026-02-25  |
| Jun   | 1  | 2026-05-26  | 2026-06-10  |
| Jun   | 2  | 2026-06-11  | 2026-06-25  |

---

## 5. Business Formulas (from Excel CARGA sheets)

These are the formulas the Excel reference sheets use. The API is supposed to reproduce them.

### 5.1. Effective col_qz

```
col_qz_efetivo = col_qz_manual ?? col_qz ?? 0
```

Manual input always takes precedence over planilha value.

### 5.2. Carga Parcial

```
carga_parcial = col_qz_efetivo - saldo_final_carga - saldo_cartao_carga - adiantamento
```

### 5.3. Reembolso

```
QZ1: reembolso = max(0, saldo_reembolsar) * reembolso_multiplier
QZ2: reembolso = 0   (always — reembolso is paid once per month, in QZ1)
```

### 5.4. Carga Final

```
carga_final = max(0, carga_parcial) + reembolso
```

### 5.5. Special Rule: Pendente Card

```
if status_cartao contains "pendente" (case-insensitive):
    carga_parcial = 0
    reembolso = 0
    carga_final = 0
```

### 5.6. Saldo Final Carga and Saldo Reembolsar

```
saldo_final_carga = max(saldo_final, 0)
saldo_reembolsar  = max(-saldo_final, 0)
```

If `saldo_final` is positive → `saldo_final_carga = saldo_final`, `saldo_reembolsar = 0`
If `saldo_final` is negative → `saldo_final_carga = 0`, `saldo_reembolsar = |saldo_final|`

### 5.7. Rounding

All monetary values are rounded to 2 decimal places:

```javascript
function r2(v) { return Math.round(v * 100) / 100; }
```

---

## 6. Excel CARGA Sheet Structure

The Excel sheets are the ground truth. Each month/quinzena has a different file with different sheet names, header rows, and column indices.

### 6.1. QZ1 Sheet Columns (typical)

| Col | Header              |
|-----|---------------------|
| 0-1 | PORTADOR, CPF       |
| 2-7 | STATUS, CENTRO CUSTO, COD, GESTOR, DIREÇÃO |
| 8   | SALDO REEMBOLSAR    |
| 9   | SALDO FINAL         |
| 10  | COL_QZ              |
| 11  | SALDO CARTAO        |
| 12  | ADIANTAMENTO        |
| ... | intermediate cols  |
| ~16 | CARGA FINAL         |

### 6.2. QZ2 Sheet Columns (different from QZ1)

The QZ2 sheets have a **completely different column layout**:

| Col | Header                          |
|-----|---------------------------------|
| 1   | PORTADOR                        |
| 2   | CPF                             |
| 3   | STATUS COLAB                    |
| 4-7 | CENTRO CUSTO, COD, GESTOR, DIREÇÃO |
| 8   | SALDO REEMBOLSAR                |
| 9   | SALDO PARCIAL PENDENTE          |
| 10  | SALDO PARCIAL COM REPROV.       |
| 11  | 1QZ DE [month] 26              |
| 12  | SALDO PENDENTE FINAL            |
| 13  | SALDO PENDENTE FINAL COM REPROV.|
| 14  | 2QZ DE [month] 26              |
| 15  | SALDO CARTAO                    |
| 16  | ADIANTAMENTO                    |
| 17  | CARGA PARCIAL SEM               |
| 18  | CARGA PARCIAL COM REPROV.       |
| 19  | REEMBOLSO                       |
| 20  | CARGA FINAL SEM CX REPROV.      |
| 21  | CARGA FINAL COM CX REPROV.2     |
| 22  | STATUS DO CARTAO                |
| 23  | OBS                             |

**Key difference:** QZ2 uses `SALDO PENDENTE FINAL` (col 12) as the "saldo", which is a different concept from QZ1's `SALDO FINAL`. The QZ2 sheet also has columns for "COM REPROV." (with reprovados) variants.

### 6.3. Excel Sheet File Paths

All paths relative to `dashboard-test/`:

| Month | QZ | File |
|-------|----|------|
| Jan   | 1  | `data/01 - JANEIRO/1QZ JANEIRO 2026 - VEXPENSES.xlsx` |
| Jan   | 2  | `data/01 - JANEIRO/2QZ JANEIRO 2026 - VEXPENSES.xlsx` |
| Feb   | 1  | `data/02 - FEVEREIRO/1 QZN FEVEREIRO VEXPENSES 2026.xlsx` |
| Feb   | 2  | `data/02 - FEVEREIRO/2QZ FEVEREIRO 2026 - VEXPENSES EQS.xlsx` |
| Mar   | 1  | `data/03 - MARÇO/1 QZ MARÇO VEXPENSES 2026 (5).xlsx` |
| Apr   | 1  | `data/04 - ABRIL/1QZ ABRIL 2026 - VEXPENSES.xlsx` |
| May   | 1  | `data/05 - MAIO/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx` |
| May   | 2  | `data/05 - MAIO/CARGA 2 QZ MAIO 26 VEXPENSES EQS.xlsx` |
| Jun   | 1  | `data/06 - JUNHO/CARGA 1 QZ JUNHO 26 VEXPENSES EQS.xlsx` |
| Jun   | 2  | `data/06 - JUNHO/CARGA 2 QZ JUNHO 26 VEXPENSES EQS.xlsx` |

### 6.4. Sheet Name and Header Row Mapping

Each sheet has a different name and header row. The header row is where column names appear; data starts on the next row.

| Month | QZ | Sheet Name                | Header Row | Data Row |
|-------|----|---------------------------|------------|----------|
| Jan   | 1  | `1 QZ VEXPENSES 01_2026`  | 6          | 7        |
| Jan   | 2  | `2 QZ VEXPENSES 01_2026`  | 6          | 7        |
| Feb   | 1  | `1 QZN FEV 2026`          | 6          | 7        |
| Feb   | 2  | `2 QZ VEXPENSES 02_2026`  | 6          | 7        |
| Mar   | 1  | `QUINZENA MARÇO`          | 6          | 7        |
| Apr   | 1  | `1 QZ VEXPENSES 04_2026`  | 6          | 7        |
| May   | 1  | `Planilha1`               | 6          | 7        |
| May   | 2  | `2 QZ DE MAIO 26`         | 4          | 5        |
| Jun   | 1  | `1 QZ JUNHO`              | 6          | 7        |
| Jun   | 2  | `2 QZ JUNHO`              | 6          | 7        |

---

## 7. How to Call the API

### Start the server

```bash
cd vexpenses-dashboard
npm run dev
# Server starts at http://localhost:3000
```

### Call the API

```bash
curl "http://localhost:3000/api/quinzena-complete?year=2026&month=6&quinzena=1"
```

### Fetch all months for validation

```javascript
const results = {};
for (const m of [1,2,3,4,5,6]) {
  for (const q of [1,2]) {
    const resp = await fetch(`http://localhost:3000/api/quinzena-complete?year=2026&month=${m}&quinzena=${q}`);
    const data = await resp.json();
    results[`${m}_${q}`] = data;
  }
}
```

---

## 8. CPF Normalization

CPFs in the API response are 11-digit strings with leading zeros (e.g. `"02027745203"`). Excel sheets may store CPFs as numbers (losing leading zeros) or as formatted strings with dots/dashes. To compare:

```python
def normalize_cpf(raw):
    s = str(raw).strip().replace(".", "").replace("-", "").replace("/", "").replace(" ", "")
    if "." in s:
        try:
            s = str(int(float(s)))
        except (ValueError, TypeError):
            pass
    return s.zfill(11) if s.isdigit() and len(s) <= 11 else None
```
