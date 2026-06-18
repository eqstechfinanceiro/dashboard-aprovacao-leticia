
## RESULTADO DA ANALISE

### 1a QZ MAIO 2026

| Opção | Período | Transações | CARGA | TRANSFERÊNCIA | TARIFA | SALDO |
|-------|---------|-----------|-------|--------------|--------|-------|
| Opção 1 | 26 Abr - 10 Mai | 862 | R$ 360,533.50 | R$ 50,494.94 | R$ 2,471.59 | R$ 307,566.97 |
| Opção 2 | 1 Mai - 15 Mai | 271 | R$ 48,099.03 | R$ 13,330.02 | R$ 813.77 | R$ 33,955.24 |

### 2a QZ MAIO 2026

| Opção | Período | Transações | CARGA | TRANSFERÊNCIA | TARIFA | SALDO |
|-------|---------|-----------|-------|--------------|--------|-------|
| Opção 1 | 11 Mai - 25 Mai | 12 | R$ 2,060.51 | R$ 560.00 | R$ 7.00 | R$ 1,493.51 |
| Opção 2 | 16 Mai - 31 Mai | 0 | R$ 0.00 | R$ 0.00 | R$ 0.00 | R$ 0.00 |

## OBSERVACOES

1. **Dia 11 de Maio**: 12 transacoes (fechamento confirmado)
2. **Dia 25 de Maio**: 0 transacoes

3. **Dia 26 de Abril**: 3 transacoes
   - Isso sugere que a 1a QZ pode incluir o fim de abril

## RECOMENDACAO

A **Opção 1 (Fechamento nos dias 11 e 25)** parece mais consistente com:
- Dia 11 sendo data de fechamento com transacoes de CARGA/TRANSFERENCIA
- Dia 26 de abril tendo transacoes que podem pertencer a 1a QZ de maio

## PARA IMPLEMENTACAO AUTOMATICA

```python
def get_periodo_quinzena(ano, mes, quinzena):
    if quinzena == "1a QZ":
        # Se mes == 1 (Janeiro), pegar de dezembro do ano anterior
        if mes == 1:
            start = f"{ano-1}-12-26"
        else:
            start = f"{ano}-{mes-1:02d}-26"
        end = f"{ano}-{mes:02d}-10"
    else:  # 2a QZ
        start = f"{ano}-{mes:02d}-11"
        end = f"{ano}-{mes:02d}-25"
    return start, end
```
