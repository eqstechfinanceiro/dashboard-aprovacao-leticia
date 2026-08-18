# Plano de Validação e Próximos Passos

## Objetivo

Chegar a um sistema que gera planilha CARGA a cada quinzena usando **apenas dados da API**, com validação 100% contra as planilhas CARGA/CONTROLE.

## Princípios

1. As planilhas são **referência**, não fonte de dados.
2. O sistema deve calcular tudo a partir de API: extrato v3, reports v2, expenses v2.
3. `saldo_final` é acumulado — precisa de **âncora** + **incremento**.
4. Snapshotar resultados a cada quinzena para servir de âncora seguinte.
5. Limpar problemas de dados antes de validar.

## Fase 1: Limpeza e estrutura (obrigatório)

### 1.1 Corrigir snapshots `valor NULL`

**Ação:**
```sql
SELECT * FROM extrato_movimentacao
WHERE is_snapshot = TRUE AND valor IS NULL;
```
- Investigar o XLSX original dessas linhas.
- Se o `Valor` estava em branco ou `-`, decidir se é 0.00 ou se a linha deve ser removida.
- Aplicar `UPDATE` para corrigir `valor`.
- Adicionar validação no `download_extrato_neon.py` e `lib/pipeline.ts` para nunca inserir snapshot sem valor.

### 1.2 Sincronizar `quinzena_config` entre Neon e Aiven

**Ação:**
- Criar `quinzena_config` em Neon (se o script Python continuar usando Neon).
- Ou unificar tudo no Aiven (dashboard).
- Inserir multipliers conhecidos:
  - 2026-01-1: 0.2
  - 2026-05-1: 0.5
  - 2026-06-1: 0.6
  - 2QZ sempre 0.0

### 1.3 Decidir critério de inclusão de colaboradores na CARGA

**Pergunta:** A CARGA deve incluir todos os 720 do CONTROLE ou só os que têm movimentação?

**Investigação:**
- Comparar CARGA MAIO 1QZ (720) vs CARGA JUNHO 1QZ (382).
- Identificar por que Junho tem menos linhas.
- Possíveis critérios: colaboradores com `carga_final > 0`, `saldo_final != 0`, ou `saldo_cartao != 0`.

## Fase 2: Implementar cálculo por âncora + incremento

### 2.1 Criar tabela de snapshot de PAINEL

```sql
CREATE TABLE quinzena_painel_snapshot (
  year INT,
  month INT,
  quinzena INT,
  cpf TEXT,
  colaborador TEXT,
  saldo_prestacao NUMERIC(14,2),
  saldo_cartao NUMERIC(14,2),
  saldo_final NUMERIC(14,2),
  carga NUMERIC(14,2),
  transferencia NUMERIC(14,2),
  tarifa NUMERIC(14,2),
  prestacao NUMERIC(14,2),
  PRIMARY KEY (year, month, quinzena, cpf)
);
```

### 2.2 Calcular âncora Maio 1QZ

**Entrada:**
- `quinzena_controle_snapshot` 2026-05-1 (importado da planilha, confiável).
- `extrato_movimentacao` até 2026-05-10.
- `somase_snapshots` 2026-05-1.

**Saída:**
- `quinzena_painel_snapshot` para 2026-05-1 com `saldo_prestacao`, `saldo_cartao`, `saldo_final`.
- Validar contra planilha CARGA MAIO 1QZ.

### 2.3 Calcular Maio 2QZ via incremento

**Entrada:**
- `quinzena_painel_snapshot` 2026-05-1 (âncora).
- `extrato_movimentacao` entre 2026-05-11 e 2026-05-25.
- `somase_snapshots` 2026-05-2 (ou delta de prestação no período).

**Cálculo:**
```
delta_carga        = SUM(transferencia positiva)  11-25/05
delta_transferencia= SUM(ABS(transferencia negativa)) 11-25/05
delta_tarifa       = SUM(taxa) 11-25/05
delta_prestacao    = SUM(expenses APROVADOS no período) 11-25/05

saldo_prestacao_2QZ = saldo_prestacao_1QZ + delta_carga - delta_transferencia - delta_tarifa - delta_prestacao
saldo_cartao_2QZ    = último snapshot <= 25/05
saldo_final_2QZ     = saldo_prestacao_2QZ - saldo_cartao_2QZ
```

**Saída:**
- `quinzena_painel_snapshot` 2026-05-2.
- Validar contra CARGA MAIO 2QZ.

### 2.4 Calcular Junho 1QZ via incremento

**Entrada:**
- `quinzena_painel_snapshot` 2026-05-2 (âncora).
- `extrato_movimentacao` entre 2026-05-26 e 2026-06-10.
- `somase_snapshots` 2026-06-1.

**Cálculo:** análogo ao passo 2.3.

**Validação:** comparar com `data/06 - JUNHO/CARGA 1 QZ JUNHO 26 VEXPENSES EQS.xlsx`.

**Atenção:** a CARGA JUNHO 1QZ tem `Carga Final` stale (multiplier 0.5 vs 0.6). Validar `SALDO FINAL`, `SALDO CARTAO`, `1ª QZ`, `CARGA PARCIAL`, e recalcular `REEMBOLSO` e `Carga Final`.

## Fase 3: Automatizar o pipeline

### 3.1 Pipeline de cálculo

1. Baixar extrato v3 (`/v3/pay/statement/excel-all`) para o período atual.
2. Atualizar `prestacao_reports` e `prestacao_expenses` da API v2.
3. Snapshotar somase no cutoff.
4. Calcular `quinzena_painel_snapshot` usando âncora + incremento.
5. Calcular CARGA final com fórmulas.
6. Salvar resultado em `quinzena_controle_snapshot` (com `import_source='api-calculado'`).

### 3.2 Cron

- Dias 10 e 25, 02:00.
- Se já executou, pular (idempotente).

### 3.3 UI

- Tela de configurações para configurar `multiplier` da próxima quinzena.
- Tela para input manual de `col_qz` e `adiantamento`.
- Tela de validação com diff planilha vs API.

## Fase 4: Validação contínua

### 4.1 Comparar cada quinzena

Para cada CPF comum entre CARGA e API:

- `saldo_final`
- `saldo_cartao`
- `carga_parcial`
- `reembolso`
- `carga_final`

### 4.2 Totais

- `total_carga_final`
- `total_saldo_final`
- `total_col_qz`

### 4.3 Divergências

Listar CPFs com diff > R$ 0.05 e classificar:

- **Arredondamento:** < R$ 1.00
- **Tarifas/estornos:** transações específicas após cutoff
- **Matching nome→CPF:** nomes diferentes no extrato
- **Cartão cancelado/substituído:** sem correspondência
- **Erro de cálculo:** regra implementada errada

## Fase 5: Evitar regressões

### 5.1 Testes de integridade

1. Nenhum snapshot com `valor NULL`.
2. Todo `saldo_final` pode ser explicado por `saldo_prestacao - saldo_cartao`.
3. `carga_parcial + saldo_final + saldo_cartao + adiantamento = col_qz` (validação da fórmula).
4. `carga_final = max(0, carga_parcial) + reembolso`.
5. Total da CARGA bate com soma dos CPFs.

### 5.2 Monitoramento

- Logs de cada etapa do pipeline.
- Alertas se diff total > 1%.
- Alertas se algum CPF não é mapeado.

## Checklist de sucesso

- [ ] 458 snapshots NULL corrigidos.
- [ ] `quinzena_config` sincronizado.
- [ ] Cálculo Maio 2QZ via âncora + incremento validado contra CARGA.
- [ ] Cálculo Junho 1QZ via âncora + incremento validado contra CARGA.
- [ ] Critério de inclusão de colaboradores definido.
- [ ] Pipeline automático rodando nos dias 10 e 25.
- [ ] Diff por CPF e totais < 1%.
