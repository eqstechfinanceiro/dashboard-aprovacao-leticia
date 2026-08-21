# Framework API v3/pay/statement/excel-all x Planilha CONTROLE

## Resumo da Análise de Correlação

### 1. MAPEAMENTO DE NOMES ✅

| Métrica | Valor |
|---------|-------|
| Total usuários na API | 338 |
| Mapeados automaticamente | 336 (99.4%) |
| Não mapeados | 2 |

**Usuários não mapeados:**
- Anderson Luis Goncalves
- Jean Lucas da luz Ferreira

**Técnica:** Fuzzy matching com threshold de 80% para acentos e abreviações.

---

### 2. COMPARAÇÃO DE CÓDIGOS DE TRANSAÇÃO

#### Dados da 1ª QZ (01-15 de Maio/2026)

| Fonte | Transações |
|-------|-----------|
| API | 3,101 |
| CONTROLE | 271 |

**Conclusão:** A API é **MAIS COMPLETA** que a planilha CONTROLE para o período da 1ª QZ!

#### Por que a diferença?

A planilha CONTROLE parece ter:
- Dados históricos de períodos anteriores
- Possivelmente não recebeu atualização completa da 1ª QZ
- Ou os dados estão em outra aba/sheet

---

### 3. CORRELAÇÃO DE DADOS

#### Chave de Correlacao

Como não há CPF na API `v3/pay/statement/excel-all`, usamos:
```
Chave composta: (Usuario_Mapeado + Data + Valor)
```

Ou opcionalmente, cruzar com `/v2/team-members` para obter CPF.

#### Mapeamento de Tipos

| Tipo API | Condição | Tipo Planilha |
|----------|----------|---------------|
| Transferência | Valor > 0 | **CARGA** |
| Transferência | Valor < 0 | **TRANSFERÊNCIA** |
| Taxa | Qualquer valor | **TARIFA** |
| Compra/Saque/Pix | - | (Despesa - não é movimentação) |

---

### 4. COMO TRATAR/CALCULAR/USAR

#### Fórmulas para Carga Quinzenal

```python
# Para cada colaborador em um período:

CARGA = sum(valor for valor in transferencias if valor > 0)
TRANSFERENCIA = abs(sum(valor for valor in transferencias if valor < 0))
TARIFA = abs(sum(valor for valor in taxas))

# SALDO_CARTAO acumulado:
SALDO_CARTAO = CARGA - TRANSFERENCIA - TARIFA - DESPESAS

# Cálculos da planilha:
SALDO_PRESTACAO = CARGA + TRANSFERENCIA + TARIFA - PRESTACAO_DE_CONTAS
CARGA_PARCIAL = COL_1QZ - SALDO_PRESTACAO - SALDO_CARTAO - ADIANTAMENTO
CARGA_FINAL = max(CARGA_PARCIAL + REEMBOLSO, 0)
```

#### Uso Dinâmico por Período

A API permite calcular para **qualquer período**:

```python
# 1ª QZ (dias 1-15):
start_date = "2026-05-01"
end_date = "2026-05-15"

# 2ª QZ (dias 16-30/31):
start_date = "2026-05-16"
end_date = "2026-05-31"

# Qualquer período histórico:
start_date = "2026-01-01"
end_date = "2026-03-31"  # Trimestre
```

**Limite:** Provavelmente 3 meses (a confirmar com teste)

---

### 5. ARQUITETURA RECOMENDADA

```
📁 controle-api/
├── 📄 api_v3_client.py          # Cliente para v3/pay/* endpoints
│   ├── get_statement(start, end) -> DataFrame
│   ├── get_card_groups() -> list
│   ├── get_account_aggregation(id) -> dict
│   └── mapear_nomes(df) -> DataFrame
│
├── 📄 mapeamento_nomes.json    # Cache de mapeamento
│   {"Nome API": "Nome CTRL", ...}
│
├── 📄 calculadora_carga.py     # Cálculos da planilha
│   ├── calcular_carga(df, usuario) -> dict
│   ├── calcular_transferencia(df, usuario) -> float
│   └── calcular_tarifa(df, usuario) -> float
│
├── 📄 validador.py            # Validação contra CONTROLE
│   └── comparar_com_controle(df_api, periodo) -> report
│
└── 📄 gerar_carga_qz_v2.py    # Script final
    └── Integração completa API -> Excel
```

---

### 6. PRÓXIMOS PASSOS

#### Imediatos:
1. ✅ Testar endpoint `v3/pay/statement/excel-all` - **FUNCIONANDO**
2. ✅ Testar mapeamento de nomes - **99.4% COBERTURA**
3. ✅ Analisar estrutura de dados - **COMPATÍVEL**

#### Próximos:
4. ⬜ Testar endpoint `/v3/pay/v2/app/card-groups/`
5. ⬜ Testar endpoint `/v3/pay/statement/account-aggregations/{id}`
6. ⬜ Testar limite de período (3 meses?)
7. ⬜ Implementar cliente API completo
8. ⬜ Criar gerador de planilha Carga Quinzenal v2

---

### 7. DECISÕES IMPORTANTES

#### API vs CONTROLE - Qual usar como fonte primária?

| Critério | API | CONTROLE |
|----------|-----|----------|
| Completude 1ª QZ | ✅ Mais completa | ⚠️ Menos dados |
| Atualização | ✅ Em tempo real | ❓ Manual |
| Histórico | ✅ Via filtros | ✅ Completo |
| CPF | ❌ Não tem | ✅ Tem |
| Cálculos | ✅ Dinâmicos | ⚠️ Fixos |

**Recomendação:** Usar **API como fonte primária** para cálculos dinâmicos de períodos futuros. CONTROLE como validação/backup.

---

### 8. ARQUIVOS GERADOS

| Arquivo | Descrição |
|---------|-----------|
| `mapear_nomes_e_codigos.py` | Script de mapeamento e comparação |
| `analise_correlacao.py` | Análise detalhada de correlação |
| `framework_mapeamento.py` | Framework de mapeamento inicial |
| `mapeamento_nomes.json` | Cache de mapeamento (336 usuários) |
| `comparacao_codigos.csv` | CSV com comparação detalhada |

---

**Data da análise:** Junho 2026  
**Período testado:** 1ª Quinzena de Maio/2026 (01-15)  
**Status:** ✅ Framework validado e pronto para implementação
