# Análise Carga Quinzenal — API-only

Pasta com a análise de como gerar a planilha **CARGA** a cada quinzena usando **apenas dados da API**, validando com as planilhas CARGA/CONTROLE.

## Arquivos

- `01_resumo_executivo.md` — visão geral, problemas, conclusão
- `02_mapeamento_valores.md` — mapeamento completo CARGA/CONTROLE ↔ API
- `03_problemas_dados.md` — problemas de dados encontrados e prioridades
- `04_plano_validacao.md` — plano de validação e próximos passos

## Resumo da conclusão

É possível gerar CARGA 100% API, mas `saldo_final` não pode ser calculado do zero com dados de 2026. A solução é **âncora + incremento**:

1. Usar uma quinzena já validada (por exemplo, Maio 1QZ) como âncora.
2. A cada nova quinzena, calcular delta de CARGA, TRANSFERÊNCIA, TARIFA e PRESTAÇÃO via API.
3. Aplicar fórmulas de CARGA PARCIAL, REEMBOLSO e CARGA FINAL.
4. Snapshotar o resultado para servir de âncora para a próxima quinzena.

Principais bloqueios identificados:

- 458 snapshots de extrato com `valor NULL`.
- `calcular_quinzena_neon.py` e `quinzena-complete` não usam âncora + incremento.
- Snapshot de Junho no DB tem 720 linhas `import_source='api'` sem dados financeiros.
- `quinzena_config` só existe em Aiven, não em Neon.
- Planilha CARGA Junho 1QZ tem `Carga Final` stale (multiplier antigo).

## O que fazer agora

1. Corrigir os 458 snapshots NULL.
2. Implementar cálculo por âncora + incremento.
3. Validar Maio 2QZ contra a planilha.
4. Validar Junho 1QZ contra a planilha.
5. Automatizar o pipeline.
