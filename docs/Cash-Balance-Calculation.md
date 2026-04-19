# Cálculo de saldo de caixa por colaborador

Este documento formaliza a lógica que o dashboard usará para decidir se um colaborador está **devedor**, **quitado** ou **credor** perante a empresa — requisito levantado pela Letícia: "para liberar um caixa para alguém, essa pessoa não pode estar devendo".

As regras foram inferidas a partir dos dados reais que a API VExpenses v2 retorna (ver [`API-VExpenses.md`](./API-VExpenses.md)).

---

## 1. Fontes de dados

| Fonte | O que fornece | Notas |
|-------|----------------|-------|
| `GET /v2/team-members` | Lista de colaboradores (`User`) | — |
| `GET /v2/reports?include=expenses.payment_method,advance` | Cada relatório com despesas e o método de pagamento de cada despesa + advances vinculados | Fonte principal do fluxo de caixa |
| `GET /v2/expenses?search=...&include=payment_method,report` | Drill-down de despesas (quando precisar filtrar por período/CC) | Exige `search`+`searchFields` |
| `POST /v2/advances` | Criar adiantamentos | **Não há `GET` público** → manter log local |
| Log local (DB) | Toda advance criada pelo dashboard | Usado quando a API não expõe |

### Campos-chave usados

- `expense.value` — valor em moeda original
- `expense.converted_value` / `converted_currency_iso` — valor convertido (se houver)
- `expense.original_currency_iso`
- `expense.reimbursable` (boolean)
- `expense.payment_method.data.reimbursable` (boolean)
- `expense.payment_method.data.affects_advance` (boolean)
- `expense.date`
- `expense.expense_id` → **é o `report_id`** (quirk da API)
- `report.status` ∈ `{ABERTO, ENVIADO, APROVADO, REPROVADO, REABERTO, PAGO}`
- `report.approval_date`, `report.payment_date`
- `report.user_id`
- `advance.value`, `advance.advance_user_id`, `advance.release_date`, `advance.advance_report_id`

---

## 2. Interpretação dos flags de `payment_method`

A API expõe dois flags por método de pagamento:

| `reimbursable` | `affects_advance` | Significado |
|----------------|-------------------|-------------|
| `false` | `true` | Dinheiro **adiantado** pela empresa (ex.: "Saque VExpenses", "Cartão Corporativo"). A despesa **consome o saldo de caixa** do colaborador. |
| `true` | `false` | Dinheiro **do próprio colaborador**. A empresa deve **reembolsar**. |
| `false` | `false` | Pagamento direto da empresa (ex.: fornecedor). Não afeta caixa nem gera reembolso. |
| `true` | `true` | Combinação rara (híbrida). Tratar como reembolsável **e** impactar caixa (double-entry). |

No tenant da EQS, os métodos observados foram todos do primeiro tipo (`Saque VExpenses` e `Cartão Corporativo Itaú`), ambos com `affects_advance=true`.

---

## 3. Fórmula do saldo

Para cada colaborador `u`, considerando um intervalo `[t0, t1]` (padrão: desde sempre até agora):

```
Saldo(u) =
    +  Σ  advance.value
         advances onde advance.advance_user_id = u
                   AND advance.release_date ∈ [t0, t1]

    −  Σ  expense.value_BRL
         expenses onde expense.user_id = u
                   AND report.status ∈ {APROVADO, PAGO}   ← só depois de aprovado conta
                   AND expense.payment_method.affects_advance = true
                   AND expense.date ∈ [t0, t1]

    −  Σ  expense.value_BRL
         expenses onde expense.user_id = u
                   AND report.status ∈ {APROVADO, PAGO}
                   AND expense.reimbursable = true
                   AND report.payment_date IS NULL         ← ainda não reembolsada
                   AND expense.date ∈ [t0, t1]
```

### Interpretação

- `Saldo > 0` → **DEVEDOR**: o colaborador recebeu mais adiantamento do que já prestou contas aprovadas. Bloqueia novo adiantamento (regra default; configurável).
- `Saldo = 0` → **QUITADO**.
- `Saldo < 0` → **CREDOR**: a empresa deve reembolsos.

> Nota: a fórmula trata reembolsos pendentes como **redução de saldo** (o colaborador virou credor). Quando `report.payment_date` for preenchido (reembolso efetivado), o valor some da conta, fechando o ciclo.

---

## 4. Conversão de moeda

Se `expense.original_currency_iso ≠ BRL`:

1. Usar `expense.converted_value` em `expense.converted_currency_iso` **se já estiver em BRL**.
2. Caso contrário, aplicar a taxa armazenada no próprio relatório ou a cotação do dia da despesa (fonte: `GET /v2/currencies` + cotação externa cacheada diariamente).
3. Se não for possível converter, o dashboard marca a linha com ⚠ e não soma no saldo até que um admin resolva manualmente.

---

## 5. Tratamento de casos de borda

| Caso | Regra |
|------|-------|
| Relatório em `ABERTO` ou `ENVIADO` | **Não** entra no saldo (ainda pode ser editado/reprovado). Mostra-se como "em análise" em coluna separada. |
| Relatório `REPROVADO` | Não entra no saldo (nada foi aprovado). Despesas voltam para o colaborador editar. |
| Relatório `REABERTO` | Tratar como `ABERTO` até reenvio. |
| Relatório `APROVADO` sem `payment_date` | Entra no saldo normalmente. Reembolsáveis deixam colaborador credor. |
| Relatório `PAGO` (ou `APROVADO` com `payment_date`) | Entra normalmente; reembolsáveis pagos são líquidos (saem e entram ao mesmo tempo, resultado zero para eles). |
| Despesa com `rejected = 1` | Ignorar. |
| Despesa com rateio (`apportionment`) | O saldo usa `expense.value` total (a pessoa que gastou é quem recebeu ou usou o adiantamento). O rateio afeta **centros de custo**, não o caixa do colaborador. |
| Advance sem `advance_report_id` | Soma normalmente ao saldo; a baixa ocorre quando uma despesa `affects_advance` for aprovada. |
| Advance cancelada localmente (antes de virar despesa) | Marcar no log local como cancelada e subtrair do saldo. |
| Colaborador desativado | Calcular saldo mesmo assim para fins de acerto final. |

---

## 6. Implementação (pseudo-código)

```ts
type Money = number; // BRL

interface BalanceRow {
  userId: number;
  name: string;
  advancesReceived: Money;
  consumedFromAdvance: Money;
  pendingReimbursement: Money;
  balance: Money;              // = advancesReceived - consumedFromAdvance - pendingReimbursement
  status: "DEVEDOR" | "QUITADO" | "CREDOR";
  lastMovement: string;        // ISO datetime
}

async function computeBalances(range?: { from: Date; to: Date }): Promise<BalanceRow[]> {
  const users   = await vex.get("/team-members", { paginate: true, per_page: 1000 });
  const reports = await vex.get("/reports", {
    include: "expenses.payment_method,expenses.expense_type,advance,user",
    paginate: true, per_page: 500,
  });
  const advancesLocal = await db.advances.findMany(/* opcional: só do período */);

  const acc = new Map<number, BalanceRow>();
  for (const u of users) acc.set(u.id, emptyRow(u));

  // 1) entradas de caixa
  for (const r of reports) {
    for (const a of r.advance?.data ?? []) {
      addAdvance(acc, a.advance_user_id, toBRL(a.value, a.original_currency_iso), a.release_date);
    }
  }
  for (const a of advancesLocal) {
    addAdvance(acc, a.advance_user_id, a.value_brl, a.release_date);
  }

  // 2) saídas de caixa (despesas aprovadas que consomem adiantamento)
  for (const r of reports) {
    if (!["APROVADO", "PAGO"].includes(r.status)) continue;
    for (const e of r.expenses?.data ?? []) {
      if (e.rejected) continue;
      const pm = e.payment_method?.data;
      if (pm?.affects_advance) {
        subConsumed(acc, e.user_id, toBRL(e), e.date);
      }
      if (e.reimbursable && !r.payment_date) {
        subPendingReimb(acc, e.user_id, toBRL(e), e.date);
      }
    }
  }

  // 3) status final
  for (const row of acc.values()) {
    row.balance = row.advancesReceived - row.consumedFromAdvance - row.pendingReimbursement;
    row.status  = row.balance > 0.01 ? "DEVEDOR"
                : row.balance < -0.01 ? "CREDOR" : "QUITADO";
  }

  return [...acc.values()];
}
```

Observação de performance: em vez de carregar 5.941 relatórios da EQS a cada request, o dashboard recalcula em **jobs de 5–10 min** e persiste o resultado (`balance_snapshots` no DB local). As views consomem o snapshot; um botão "Recalcular agora" força refresh.

---

## 7. Verificação antes de liberar adiantamento

Ao clicar em **"Liberar adiantamento"** para um colaborador:

1. Buscar o saldo mais recente desse colaborador.
2. Se `status === "DEVEDOR"`:
   - Exibir alerta amarelo "⚠ Colaborador está devendo R$ X" com:
     - Lista das 10 últimas despesas que somaram ao débito.
     - Botões: **Cancelar** / **Liberar mesmo assim** (só aparece para usuários com role `admin`).
3. Se `status === "QUITADO"` ou `"CREDOR"`:
   - Permitir normalmente.
4. Ao confirmar:
   - `POST /v2/advances` com `{description, advance_user_id, advance_date, value, currency_iso, creator_user_id}`.
   - Inserir linha equivalente no log local `advances`.
   - Adicionar evento na auditoria (`actor`, `timestamp`, `justification` se foi forçado).
   - Recalcular saldo do colaborador imediatamente.

---

## 8. Testes sugeridos

Cenários a cobrir em testes de unidade:

1. Colaborador novo, sem despesas nem advances → saldo 0, `QUITADO`.
2. Advance de R$ 1.000, sem despesas → saldo +1000, `DEVEDOR`.
3. Advance de R$ 1.000 + despesa aprovada de R$ 600 com `affects_advance` → saldo +400, `DEVEDOR`.
4. Advance de R$ 1.000 + despesa aprovada de R$ 1.000 com `affects_advance` → saldo 0, `QUITADO`.
5. Só despesa reembolsável de R$ 500 aprovada sem pagamento → saldo −500, `CREDOR`.
6. Despesa reembolsável paga (`payment_date` preenchido) → saldo 0.
7. Relatório em `ENVIADO` não afeta saldo.
8. Relatório `REPROVADO` não afeta saldo.
9. Despesa em USD com `converted_value` em BRL → soma em BRL.
10. Múltiplos rateios em uma despesa — saldo do colaborador ignora rateio, só usa `expense.value`.
