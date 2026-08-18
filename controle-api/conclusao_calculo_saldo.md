
## FORMULA DO SALDO CARTAO (VALIDADA)

```
SALDO_CARTAO = CARGA - TRANSFERÊNCIA - TARIFA

Onde:
- CARGA = Soma de transferências COM valor positivo (entradas)
- TRANSFERÊNCIA = Soma absoluta de transferências COM valor negativo (saídas)
- TARIFA = Soma absoluta de todas as taxas
```

## REGRA DE FECHAMENTO

Com fechamento nos dias 11 e 25:

### Hipótese 1 (Mais provável):
- **1ª QZ**: Dia 26 do mês anterior até dia 10 do mês atual
  - Fechamento/Processamento: Dia 11
- **2ª QZ**: Dia 11 até dia 25 do mês atual
  - Fechamento/Processamento: Dia 25

### Hipótese 2 (Calendário):
- **1ª QZ**: Dia 1 até dia 15
- **2ª QZ**: Dia 16 até dia 30/31

## PARA USAR COM A API

A API `v3/pay/statement/excel-all` retorna exatamente os mesmos dados:
- Transferências (positivo = CARGA, negativo = TRANSFERÊNCIA)
- Taxas (TARIFA)

Portanto, a MESMA fórmula pode ser aplicada aos dados da API!

### Processo:
1. Download via API para o período desejado
2. Mapear nomes (API -> CTRL)
3. Calcular: CARGA, TRANSFERÊNCIA, TARIFA por usuário
4. Aplicar fórmula: SALDO = CARGA - TRANSFERÊNCIA - TARIFA
5. Validar contra planilha CARGA QZ (opcional)
