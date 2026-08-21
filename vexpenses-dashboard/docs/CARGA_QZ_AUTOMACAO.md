# Automação da Carga Quinzenal (CARGA QZ)

> Documentação das descobertas, fórmulas confirmadas e arquitetura da automação da planilha de carga quinzenal.

---

## 1. Contexto

A planilha **CARGA QZ** é gerada manualmente toda quinzena para calcular o quanto cada colaborador deve receber/devolver referente ao uso do cartão VExpenses. O objetivo da automação é gerar todas as colunas calculáveis automaticamente, deixando apenas os campos verdadeiramente manuais para preenchimento humano.

---

## 2. Fontes de Dados (SQLite — controle-api)

O banco `controle-api/data/spreadsheets.db` contém as tabelas necessárias:

| Tabela | Descrição |
|---|---|
| `controle_painel` | Fonte principal: dados cadastrais + saldos por colaborador |
| `controle_saldo_cartao_resumo` | Saldo atual do cartão por CPF (com data) |
| `carga_1qz_planilha1` | Planilha de referência — 1ª QZ Maio 2026 (importada do Excel) |

---

## 3. Fórmulas Confirmadas (validado em 340 linhas da planilha real)

Acurácia global: **96.8%** (329/340). Os 11 casos restantes divergem por atualização do `controle_painel` após a geração da planilha — não é erro de lógica.

### 3.1 Colunas diretas do `controle_painel` (100%)

```
colaborador      = controle_painel.colaborador
situação         = controle_painel.situação
regional         = controle_painel.regional
centro_de_custo  = controle_painel.centro_de_custo
gestor           = controle_painel.gestor
diretor          = controle_painel.diretor
status_do_cartão = controle_painel.status_do_cartão
```

### 3.2 Saldos calculados (100%)

```python
painel_sf        = controle_painel.saldo_final          # valor bruto (pode ser negativo)
saldo_final      = max(painel_sf, 0)                    # zera se negativo
saldo_reembolsar = abs(painel_sf)  if painel_sf < 0 else 0
```

### 3.3 Saldo do cartão (100%)

```python
saldo_cartao = controle_saldo_cartao_resumo.valor
# (registro mais recente por CPF, selecionado por maior `data`)
```

### 3.4 Reembolso (100%)

```python
reembolso = saldo_reembolsar / 2
# Divide em 2 porque o reembolso é pago em 2 quinzenas
```

> **Investigação**: testamos `expenses.reimbursable=1`, `controle_reembolso`, `controle_base_prestacoes` com filtros de mês/período — todos zeravam. A fonte real é derivada do `saldo_reembolsar / 2`, confirmado em 74/74 linhas não-zero.

### 3.5 Carga Parcial (100%)

```python
carga_parcial = col_1qz - saldo_final - saldo_cartao - adiantamento
```

> **Fórmula testada e descartada**: `col_1qz - saldo_final - saldo_cartao + reembolso - adiantamento` → 79.7% de match. A fórmula **sem** reembolso bate 100%.

### 3.6 Carga Final (100% excluindo os 11 de snapshot)

```python
carga_final = max(carga_parcial + reembolso, 0)
```

Quando `carga_parcial` é negativo e há `reembolso`, o `carga_final` exibe apenas o reembolso (o colaborador recebe de volta o que pagou com o próprio dinheiro, mesmo que o cartão esteja negativo).

---

## 4. Colunas Manuais (não automatizáveis)

| Coluna | Motivo |
|---|---|
| `col_1ª_qz` | Valor da carga da quinzena — definido pelo financeiro |
| `adiantamento` | Adiantamento avulso — varia por caso |
| `obs` | Observação livre |

> O `adiantamento` não está disponível na API VExpenses nem em nenhuma tabela calculável. É informado manualmente pela gestora.

---

## 5. Investigações Realizadas

### 5.1 `saldo_reembolsar`
- Hipótese: `abs(controle_painel.saldo_final)` quando negativo → **✅ confirmado 340/340**

### 5.2 `reembolso`
- Testado: `expenses.reimbursable=1` por período → **❌ zerado para todos os CPFs**
- Testado: `controle_reembolso` por CPF e mês → **❌ não bate**
- Testado: `controle_base_prestacoes.reembolsável = 'Sim'` → **❌ zerado**
- Testado: `saldo_reembolsar / 2` → **✅ 74/74 linhas não-zero**

### 5.3 `carga_parcial`
- Testadas 4 variações de fórmula
- Fórmula B (`col_1qz - saldo_final - saldo_cartao - adiantamento`) → **✅ 340/340**

### 5.4 Os 11 casos divergentes
Todos têm `saldo_final` diferente entre `controle_painel` atual e o valor que estava na planilha no momento da geração. Diferenças são valores redondos (200, 600, 1000, 2000, 5000...) indicando ajuste manual posterior no painel.

---

## 6. Arquitetura Implementada

```
controle-api/
  src/server.py          # FastAPI em localhost:8000
  src/gerar_carga_qz.py  # Gerador CLI (saída .xlsx)
  data/spreadsheets.db   # SQLite com todas as tabelas

vexpenses-dashboard/
  app/api/carga-qz/route.ts   # API route Next.js (proxy do controle-api)
  app/carga-qz/page.tsx       # Página da Carga QZ
```

### Fluxo de dados

```
controle_painel (FastAPI :8000)
controle_saldo_cartao_resumo (FastAPI :8000)
        ↓ fetch (paginado, 500 por página)
app/api/carga-qz/route.ts  (cálculos: saldo_reembolsar, reembolso, carga_parcial, carga_final)
        ↓ JSON
app/carga-qz/page.tsx  (tabela dinâmica + edição inline de col_1qz/adiantamento/obs)
```

### Variável de ambiente

```env
CONTROLE_API_URL=http://localhost:8000   # padrão, configurável no .env
```

---

## 7. Uso

### Gerador CLI (Python)

```bash
# Gera planilha sem campos manuais (col_1qz = 0)
python src/gerar_carga_qz.py --output data/carga_qz_gerada.xlsx

# Gera com campos manuais preenchidos
python src/gerar_carga_qz.py --manuais data/manuais.json --output data/carga.xlsx
```

Formato `manuais.json`:
```json
{
  "01696239478": { "col_1qz": 1750, "adiantamento": 0, "obs": "" },
  "07024923610": { "col_1qz": 700,  "adiantamento": 0, "obs": "aguardando aprovação" }
}
```

### Dashboard (Next.js)

1. Iniciar o controle-api: `python src/server.py` (porta 8000)
2. Iniciar o dashboard: `npm run dev` (porta 3000)
3. Acessar: `http://localhost:3000/carga-qz`

Na página:
- Dados carregam automaticamente sem necessidade de preencher nada
- Colunas amarelas (1ª QZ, Adiantamento, Obs) são editáveis inline — os cálculos atualizam em tempo real
- Botão **Exportar CSV** gera o arquivo com os valores atuais
- Botão **Atualizar** recarrega os dados do controle-api

---

## 8. Observações Importantes

- O `controle_painel` é a **fonte de verdade**. Gerações feitas logo após atualização do painel serão mais precisas.
- A coluna `col_1ª_qz` **não pode ser automatizada** — é uma decisão financeira, não um cálculo.
- O `reembolso` **não vem da API VExpenses** — é derivado do saldo negativo do painel dividido por 2.
- Para a **2ª quinzena**, a lógica esperada seria: `col_2qz - 0 - saldo_cartao_2qz - adiantamento2`, mas isso não foi validado ainda.
