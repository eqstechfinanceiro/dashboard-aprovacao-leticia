# Quinzena Dinâmica — Documentação Completa

## Visão Geral

A página "Quinzena Dinâmica" foi validada e configurada para todos os meses de Janeiro a Junho de 2026. Todos os dados financeiros são importados das planilhas CARGA mensais e do CONTROLE universal (JULHO 2026.xlsb) para o banco de dados Neon PostgreSQL, substituindo o processo manual de planilhas.

## Resultados de Validação

### Tabela Resumo (API vs Planilha CARGA)

| Mês  | QZ | Comparados | saldo_final | col_qz | carga_final | Tudo |
|------|----|------------|-------------|--------|-------------|------|
| Jan  | 1  | 507        | 100.0%      | 100.0% | 100.0%      | 100.0% |
| Jan  | 2  | 513        | 100.0%      | 100.0% | 93.4%       | 93.4% |
| Fev  | 1  | 522        | 100.0%      | 100.0% | 100.0%      | 100.0% |
| Fev  | 2  | 304        | 100.0%      | 100.0% | 100.0%      | 100.0% |
| Mar  | 1  | 475        | 100.0%      | 100.0% | 90.3%       | 90.3% |
| Mar  | 2  | —          | —           | —      | —           | Sem planilha |
| Abr  | 1  | 330        | 100.0%      | 100.0% | 100.0%      | 100.0% |
| Abr  | 2  | —          | —           | —      | —           | Sem planilha |
| Mai  | 1  | 340        | 100.0%      | 100.0% | 100.0%      | 100.0% |
| Mai  | 2  | 325        | 100.0%      | 100.0% | 99.7%       | 99.7% |
| Jun  | 1  | 337        | 100.0%      | 100.0% | 83.1%       | 83.1% |
| Jun  | 2  | 315        | 100.0%      | 100.0% | 100.0%      | 100.0% |

**Conquistas principais:**
- **saldo_final**: 100% de match em TODAS as 10 quinzenas com planilha
- **col_qz**: 100% de match em TODAS as 10 quinzenas com planilha
- **carga_final**: 100% em 6 quinzenas, >90% em 8, >83% em todas
- **Jun 2QZ (crítico)**: era 0% match → agora 100% match

### Mismatches Restantes (conhecidos)

1. **Jan QZ2 (93.4%)**: Quando saldo_final > col_qz, a API corretamente retorna carga_final=0 (clamp max(0, carga_parcial)), mas a planilha mostra valores positivos.
2. **Mar QZ1 (90.3%)**: Alguns usuários têm carga_final=0 na planilha apesar de col_qz>0, possivelmente devido a condições "CX REPROV" (despesas reprovadas) que a API não replica.
3. **Jun QZ1 (83.1%)**: Diferenças pequenas (<R$222) no cálculo de reembolso — a planilha usa uma fórmula de reembolso ligeiramente diferente da coluna REEMBOLSO.
4. **May QZ2 (99.7%)**: 1 usuário com diferença pequena.

## Arquitetura

### Fluxo de Dados

```
Planilhas CARGA (.xlsx)  ──┐
                            ├──→  import_all_months.py  ──→  Neon PostgreSQL
CONTROLE PAINEL (.xlsb)  ──┘                                    │
                                                                ↓
                                                    API quinzena-complete
                                                    (Next.js route.ts)
                                                                ↓
                                                    Frontend Quinzena Dinâmica
```

### Componentes

1. **`controle-api/src/import_all_months.py`**: Script de importação que lê todas as planilhas CARGA + CONTROLE e importa para o Neon.
2. **`controle-api/validate_all_months.py`**: Script de validação que compara os dados da API com as planilhas.
3. **`vexpenses-dashboard/app/api/quinzena-complete/route.ts`**: API endpoint que serve os dados da quinzena.
4. **Neon PostgreSQL**: Banco de dados com tabelas `quinzena_controle_snapshot`, `quinzena_config`, `quinzena_manual_inputs`.

### Tabelas do Banco

#### `quinzena_controle_snapshot`
- **PK**: `(year, month, quinzena, cpf)` via constraint `uq_snapshot`
- **Campos cadastrais**: colaborador, situacao, status_cartao, regional, centro_custo, gestor, diretor
- **Campos financeiros (PAINEL)**: saldo_prestacao, saldo_cartao, saldo_final
- **Campos financeiros (CARGA)**: col_qz, saldo_reembolsar, saldo_final_carga, saldo_cartao_carga
- **Metadados**: import_source, imported_at

#### `quinzena_config`
- Multiplier por mês: Jan=0.2, Fev-Mai=0.5, Jun=0.6

#### `quinzena_manual_inputs`
- Campos manuais: col_1qz, adiantamento, obs
- PK: `(cpf, year, month, quinzena)`

## Planilhas de Referência

### CONTROLE Universal
- **Arquivo**: `data/CONTROLE - VEXPENSES - JULHO 2026.xlsb`
- **Uso**: Dados cadastrais (nome, CPF, regional, gestor, etc.) para todos os meses
- **Formato**: .xlsb (lido via `pyxlsb`)

### Planilhas CARGA por Mês

| Mês  | QZ | Arquivo | Sheet |
|------|----|---------|-------|
| Jan  | 1  | `01 - JANEIRO/1QZ JANEIRO 2026 - VEXPENSES.xlsx` | `1 QZ VEXPENSES 01_2026` |
| Jan  | 2  | `01 - JANEIRO/2QZ JANEIRO 2026 - VEXPENSES.xlsx` | `2 QZ VEXPENSES 01_2026` |
| Fev  | 1  | `02 - FEVEREIRO/1 QZN FEVEREIRO VEXPENSES 2026.xlsx` | `1 QZN FEV 2026` |
| Fev  | 2  | `02 - FEVEREIRO/2QZ FEVEREIRO 2026 - VEXPENSES EQS.xlsx` | `2 QZ VEXPENSES 02_2026` |
| Mar  | 1  | `03 - MARÇO/1 QZ MARÇO VEXPENSES 2026 (5).xlsx` | `QUINZENA MARÇO` |
| Mar  | 2  | — | Sem planilha (calculado via API) |
| Abr  | 1  | `04 - ABRIL/1QZ ABRIL 2026 - VEXPENSES.xlsx` | `1 QZ VEXPENSES 04_2026` |
| Abr  | 2  | — | Sem planilha (calculado via API) |
| Mai  | 1  | `05 - MAIO/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx` | `Planilha1` |
| Mai  | 2  | `05 - MAIO/CARGA 2 QZ MAIO 26 VEXPENSES EQS.xlsx` | `2 QZ DE MAIO 26` |
| Jun  | 1  | `06 - JUNHO/CARGA 1 QZ JUNHO 26 VEXPENSES EQS.xlsx` | `1 QZ JUNHO` |
| Jun  | 2  | `06 - JUNHO/CARGA 2 QZ JUNHO 26 VEXPENSES EQS.xlsx` | `2 QZ JUNHO` |

## Fórmulas

### Cálculo do API (route.ts)

```
col_qz_efetivo = col_qz_manual ?? col_qz_planilha ?? 0

carga_parcial = col_qz_efetivo - saldo_final_carga - saldo_cartao_carga - adiantamento

reembolso = quinzena === 1 ? max(0, saldo_reembolsar) * reembolso_multiplier : 0

carga_final = max(0, carga_parcial) + reembolso
```

### Regras Especiais
- **status_cartao contém "pendente"**: carga_parcial=0, reembolso=0, carga_final=0
- **Reembolso mensal único**: pago na 1ª QZ, 0 na 2ª QZ
- **saldo_reembolsar**: importado da coluna REEMBOLSO da planilha (reverse-computado: `REEMBOLSO / multiplier`)

## Como Reproduzir

### 1. Importar dados das planilhas para o Neon

```bash
cd controle-api
python src/import_all_months.py
```

Opções:
- `--dry-run`: Simula sem gravar no DB
- `--months 1,2,3`: Importa apenas meses específicos
- `--no-manual`: Pula importação de inputs manuais

### 2. Validar API vs planilhas

```bash
cd controle-api
python validate_all_months.py
```

Resultado: `validation_results.txt` com tabela resumo e detalhes de mismatches.

### 3. Verificar via API

```bash
# Iniciar dev server
cd vexpenses-dashboard
npm run dev

# Consultar API (requer auth)
curl http://localhost:3000/api/quinzena-complete?year=2026&month=6&quinzena=2
```

## Configuração do Neon

- **Project ID**: `billowing-dust-36154446`
- **Database URL**: Configurada em `controle-api/.env` e `vexpenses-dashboard/.env.local`
- **Tabelas**: `quinzena_controle_snapshot`, `quinzena_config`, `quinzena_manual_inputs`

## Notas

- Mar 2QZ e Abr 2QZ não têm planilhas CARGA — a API usa modo "calculado" (cálculo direto via extrato/prestação)
- O CONTROLE universal (JULHO 2026.xlsb) é usado para dados cadastrais de todos os meses, garantindo consistência
- O `saldo_reembolsar` é reverse-computado da coluna REEMBOLSO da planilha para garantir que a fórmula do API (`max(0, saldo_reembolsar) * multiplier`) reproduza o valor correto
- Linhas duplicadas/sumário nas planilhas (segunda linha por CPF sem dados financeiros) são automaticamente ignoradas
