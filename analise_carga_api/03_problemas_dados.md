# Problemas de Dados Identificados

## 1. Snapshots de extrato com `valor NULL`

### Onde foi encontrado
- Tabela: `extrato_movimentacao`
- Condição: `is_snapshot = TRUE AND valor IS NULL`
- Quantidade: **458 registros**

### Exemplos

| data | usuario | valor | descricao | status | numero_cartao |
|---|---|---|---|---|---|
| 2026-03-16 | ALISSON RODRIGO RAMBO | NULL | NULL | - | - |
| 2026-01-12 | ALISSON RODRIGO RAMBO | NULL | NULL | - | - |
| 2026-03-11 | ANA CRISTINA FREIRE HOLANDA | NULL | NULL | - | - |

### Impacto
- `calcular_quinzena_neon.py` quebra ao buscar `saldo_cartao`:
  ```
  TypeError: float() argument must be a string or a real number, not 'NoneType'
  ```
- O dashboard `quinzena-complete` pode retornar saldo_cartao `NULL` ou 0 para esses CPFs, distorcendo `saldo_final`.

### Causa provável
- Linhas do XLSX de extrato da API v3 com `Valor` em branco, `-`, ou `NaN`.
- A função `_to_float()` do `download_extrato_neon.py` retorna `0.0` para valores inválidos, mas `float('nan')` pode ser inserido como `NULL` no PostgreSQL `NUMERIC`.

### Solução recomendada
1. Limpar os 458 registros: `UPDATE extrato_movimentacao SET valor = 0 WHERE is_snapshot = TRUE AND valor IS NULL` (ou investigar o XLSX original).
2. Adicionar proteção na importação para converter `NaN`/vazio para `0.0`.
3. Adicionar `NOT NULL` constraint em `valor` quando `is_snapshot = TRUE` (depois de limpar).
4. Ajustar queries `buscar_saldo_cartao` para ignorar `valor IS NULL`.

## 2. `calcular_quinzena_neon.py` não usa âncora + incremento

### Onde está o problema
- Função `calcular_quinzena()` linha 258-265.
- Quando `snap` não tem `saldo_final_carga` nem `saldo_final`, ele calcula:
  ```python
  saldo_prestacao = carga_acum + transferencia_ac - tarifa_acum - prestacao
  ```
  onde `carga_acum`, `transferencia_ac`, `tarifa_acum` são **só do período da quinzena**.

### Por que está errado
- O PAINEL acumula `saldo_prestacao` desde a criação do cartão.
- Somente o período da quinzena não representa o saldo real.
- O correto é usar a quinzena anterior como âncora e somar o delta.

### Solução recomendada
- Implementar cálculo por **âncora + incremento**.
- Buscar `saldo_prestacao_ancora` e `saldo_final_ancora` da quinzena anterior.
- Calcular delta do período e aplicar.

## 3. `app/api/quinzena-complete/route.ts` calcula saldo acumulado desde 2026-01-01

### Onde está o problema
- Quando não há snapshot (`hasNeonData = false`), o endpoint busca:
  ```sql
  SELECT ... FROM extrato_movimentacao WHERE is_snapshot = FALSE AND data <= end_date
  ```
- Isso acumula extrato desde o início do banco (2025-05-26 ou 2026-01-01) até `end_date`.
- A somase é filtrada por `approval_date <= end_date`.

### Por que está errado
- Assume que o saldo do cartão no início do histórico era zero.
- Para cartões com histórico pré-2026, isso está incorreto.
- Não usa `saldo_prestacao` da quinzena anterior como ponto de partida.

### Solução recomendada
- Buscar `saldo_prestacao` e `saldo_final` da quinzena anterior.
- Calcular delta do período (extrato entre `prev_fechamento` e `fechamento`).
- Aplicar `saldo_prestacao = saldo_prestacao_ancora + delta_carga - delta_transfer - delta_tarifa - delta_prestacao`.

## 4. Snapshot do DB para junho/2026 tem 720 linhas `import_source='api'` sem dados financeiros

### Onde foi encontrado
- `quinzena_controle_snapshot` para `2026-06-1` e `2026-06-2`.
- `import_source = 'api'` com 720 linhas.
- Campos financeiros (`saldo_prestacao`, `saldo_cartao`, `saldo_final`, `col_qz`, etc.) estão zerados.

### Impacto
- O dashboard filtra `import_source != 'api'` e cai em modo `calculado`.
- Usa `cadastroBase` (720 cadastros do CONTROLE) para gerar as linhas.
- A CARGA real de Junho tem ~382 linhas. Gera divergência de base.

### Causa provável
- `refresh_cadastro` do pipeline criou snapshot `api` copiando cadastro do snapshot anterior, mas não preencheu dados financeiros.

### Solução recomendada
- Não inserir snapshot `api` com dados financeiros zerados.
- Ou, ao calcular, filtrar para colaboradores que aparecem no extrato/prepend da quinzena (CARGA employees).
- Ou importar a CARGA de Junho para o DB (mas o usuário quer evitar isso; apenas validar).

## 5. Planilha CARGA JUNHO 1QZ tem `Carga Final` stale

### Onde foi encontrado
- Arquivo: `data/06 - JUNHO/CARGA 1 QZ JUNHO 26 VEXPENSES EQS.xlsx`
- Exemplo ABNER (linha 7):
  - `SALDO REEMBOLSAR` = 227.55
  - `CARGA PARCIAL` = 9835.00
  - `REEMBOLSO` = 136.53 (0.6 × 227.55)
  - `Carga Final` = 9948.775 (parece 0.5 × 227.55 = 113.775 + 9835)

### Impacto
- A planilha CARGA não pode ser usada como source of truth para `Carga Final`.
- A API que recalcula com multiplier correto é mais confiável.

### Solução recomendada
- Validar apenas colunas coladas: `SALDO FINAL`, `SALDO REEMBOLSAR`, `SALDO CARTAO`, `1ª QZ`, `Adiantamento`.
- Recalcular `CARGA PARCIAL`, `REEMBOLSO`, `Carga Final` com as fórmulas e multiplier atual.

## 6. Discrepância de número de linhas: CARGA vs CONTROLE

### Onde foi encontrado
- CARGA JUNHO 1QZ: 382 linhas com dados.
- CONTROLE snapshot: 720 linhas (todos os colaboradores cadastrados).

### Impacto
- A CARGA deve incluir apenas colaboradores que têm movimentação na quinzena? Ou todos do CONTROLE?
- Se usar 720, muitos terão `carga_final = 0` e `saldo_final = 0`.
- Se usar 382, precisa de critério de inclusão.

### Solução recomendada
- Definir regra: incluir todos os colaboradores do CONTROLE? Ou apenas os que aparecem no extrato/prestação da quinzena?
- As planilhas CARGA parecem ter um subconjunto (talvez os que receberam carga). Investigar critério de inclusão nas planilhas históricas.

## 7. `quinzena_config` não existe em Neon (só em Aiven)

### Onde foi encontrado
- Aiven DB: `quinzena_config` existe com 5 registros.
- Neon DB: `quinzena_config` não existe.

### Impacto
- O `calcular_quinzena_neon.py` (Neon) não pode usar o multiplier correto (usa hardcoded 0.5).
- O dashboard (Aiven) usa o multiplier correto.
- Divergência entre script Python e dashboard.

### Solução recomendada
- Criar `quinzena_config` em Neon (ou usar Aiven como DB único).
- Manter multipliers sincronizados entre os dois bancos.

## 8. `somase_snapshots` em Neon não está filtrado por cutoff correto

### Onde está o problema
- `snapshot_somase_api.py` e `snapshotSingleQuinzena` em `pipeline.ts` usam `updated_at <= cutoff`.
- O correto seria usar `approval_date` ou o momento em que o report passou para APROVADO.
- Reports podem mudar de status após o cutoff.

### Impacto
- O somase acumulado pode incluir reports aprovados depois do cutoff ou excluir reports que eram aprovados no cutoff.
- Diferença de R$925k encontrada entre API e planilha BASE PREST (reports mudaram de status após exportação).

### Solução recomendada
- Snapshotar somase no momento exato do fechamento.
- Não atualizar somase de quinzenas passadas (não fazer refresh retroativo).
- Salvar histórico de mudanças de status de reports para auditoria.

## 9. Matching nome→CPF no extrato pode falhar

### Onde está o problema
- `resolveCpfByName()` em `route.ts` faz fuzzy matching com threshold 0.88.
- Há 6 nomes no extrato que não batem com o cadastro (CHARLYTON, JEAN LUCAS, JOSE CLEBER, PRISCILA, SAMUEL, FRANCIELLY).

### Impacto
- Transações desses usuários ficam sem CPF.
- `saldo_prestacao`, `saldo_cartao`, e `carga_final` não são computados para eles.

### Causa provável
- Cartões cancelados/substituídos.
- Nomes diferentes no extrato vs cadastro.

### Solução recomendada
- Mapeamento manual de exceções.
- Identificar por `numero_cartao` ou `codigo_transacao`.
- Criar tabela `extrato_cpf_mapping` para casos especiais.

## 10. Dados cadastrais (regional, gestor, diretor) não vêm da API

### Onde está o problema
- `/v2/team-members` retorna `costs_center`, mas não `regional`, `gestor`, `diretor`.
- A planilha CONTROLE usa lookup na aba `AUX`.

### Impacto
- Dados cadastrais precisam vir de snapshot anterior ou tabela `aux` manual.
- Se um colaborador mudar de centro de custo, o sistema não detecta.

### Solução recomendada
- Manter tabela `aux` atualizada.
- Atualizar regional/gestor/diretor com base no centro de custo da API.
- Revisar exceções de nomenclatura (acentos, abreviações).

## Prioridade de correção

| Problema | Severidade | Bloqueia API-only? |
|---|---|---|
| Snapshots NULL | Alta | Sim |
| Cálculo sem âncora | Alta | Sim |
| Snapshot `api` sem dados financeiros | Alta | Sim |
| `quinzena_config` em Neon | Média | Não (dashboard funciona) |
| `Carga Final` stale na planilha | Baixa | Não (API recalcula) |
| Discrepância de linhas | Média | Não, mas afeta validação |
| Somase cutoff | Média | Sim (afeta saldo_final) |
| Matching nome→CPF | Média | Parcialmente |
| Dados cadastrais | Baixa | Não |
