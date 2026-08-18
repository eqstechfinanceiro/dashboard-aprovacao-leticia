# MAPEAMENTO DEFINITIVO — Carga Quinzenal (verificado célula a célula)

> **Status:** Verificado diretamente nas planilhas reais (`CARGA 1 QZ MAIO 26` e
> `CONTROLE - VEXPENSES - MAIO - 2026`) em 16/06/2026, lendo **fórmulas e valores
> célula a célula** com openpyxl. **Este documento substitui** as partes
> conflitantes/enganosas de `ESTRUTURA_CARGA.md` e `10-mapeamento-carga-quinzenal.md`.

---

## 1. Descoberta central: a CARGA é um "print" de valores colados do PAINEL

A planilha de CARGA **NÃO calcula quase nada**. Na área de dados (linhas 7+),
as colunas A–L e Q são **valores colados** (paste-special as values) tirados do
PAINEL do CONTROLE no momento em que a carga é gerada. Só existem **3 fórmulas vivas**:

| Col | Campo            | Conteúdo real na célula (linha 7, Jonas)                          | É fórmula? |
|-----|------------------|-------------------------------------------------------------------|-----------|
| A   | COLABORADOR      | `'JONAS CAVALCANTI DE OLIVEIRA'`                                   | ❌ colado |
| B   | CPF              | `'01696239478'`                                                   | ❌ colado |
| C   | SITUAÇÃO         | `'ATIVO'`                                                         | ❌ colado |
| D   | REGIONAL         | `'REGIONAL NE'`                                                   | ❌ colado |
| E   | CENTRO DE CUSTO  | `'3R PETROLEUM NE'`                                               | ❌ colado |
| F   | GESTOR           | `'GERSON OLIVEIRA'`                                               | ❌ colado |
| G   | DIRETOR          | `'ROGERIO SCATAMBULO'`                                            | ❌ colado |
| H   | SALDO REEMBOLSAR | `0`                                                              | ❌ colado |
| I   | SALDO FINAL      | `6945.16`                                                        | ❌ colado |
| J   | 1ª QZ            | `1750`                                                           | ❌ colado (manual) |
| K   | SALDO CARTAO     | `15.21`                                                          | ❌ colado |
| L   | Adiantamento     | (vazio)                                                          | ❌ colado (manual) |
| M   | CARGA PARCIAL    | `=[1ª QZ]-[SALDO FINAL]-[SALDO CARTAO]-[Adiantamento]`            | ✅ fórmula |
| N   | REEMBOLSO        | `=[SALDO REEMBOLSAR]*$N$4`  (N4 = 0,5)                            | ✅ fórmula |
| O   | Carga Final      | `=IF([CARGA PARCIAL]<0,0,[CARGA PARCIAL])+[REEMBOLSO]`            | ✅ fórmula |
| Q   | STATUS DO CARTÃO | `'Cartão ativo'`                                                 | ❌ colado |

**Implicação para automação:** para reproduzir a carga de qualquer quinzena
(passada ou futura) **temos que reproduzir o PAINEL** — é lá que está o cálculo real.

---

## 2. SALDO FINAL e SALDO REEMBOLSAR — como a CARGA divide o saldo do PAINEL

Verificado nos dados reais: **quando SALDO REEMBOLSAR > 0, o SALDO FINAL da CARGA = 0.**
Ex.: ABNER → SALDO FINAL=0, SALDO REEMBOLSAR=1083,01 (⇒ painel.saldo_final = −1083,01).

A CARGA pega o `saldo_final` do PAINEL (que pode ser negativo) e o **separa em duas colunas**:

```
carga.SALDO FINAL       = max(painel.saldo_final, 0)     # parte positiva
carga.SALDO REEMBOLSAR  = max(-painel.saldo_final, 0)    # |parte negativa|
```

- `painel.saldo_final` **positivo** → colaborador ainda tem saldo/obrigação a acertar.
- `painel.saldo_final` **negativo** → empresa deve reembolsá-lo (vai pra SALDO REEMBOLSAR).
- REEMBOLSO = SALDO REEMBOLSAR × 0,5 → a empresa reembolsa **50% por quinzena**.

> ⚠️ A doc antiga `ESTRUTURA_CARGA.md` dizia que SALDO REEMBOLSAR vinha de
> `=SUBTOTAL(9,H7:H346)`. **Isso está errado** — aquela é só a fórmula de **total da
> coluna** (linha 5, área de cabeçalho), não a origem do valor por colaborador.

---

## 3. O PAINEL é o motor — fórmulas reais (confirmadas célula a célula)

Aba `PAINEL` do CONTROLE, linha de dados 12 (ABNER):

| Col | Campo                    | Fórmula real                                                                 |
|-----|--------------------------|------------------------------------------------------------------------------|
| N   | CARGA                    | `=SUMIFS(EXTRATO!L:L, EXTRATO!J:J,"CARGA",   EXTRATO!I:I,[COLABORADOR])`      |
| O   | TRANSFERENCIA            | `=SUMIFS(EXTRATO!L:L, EXTRATO!J:J,"TRANSFERÊNCIA", EXTRATO!I:I,[COLABORADOR])`|
| P   | (-) TARIFA               | `=SUMIFS(EXTRATO!L:L, EXTRATO!J:J,"TARIFA",  EXTRATO!I:I,[COLABORADOR])`      |
| Q   | (-) PRESTAÇÃO DE CONTAS  | `=SUMIF('BASE PREST'!J:J, [CPF], 'BASE PREST'!AA:AA)`                         |
| R   | SALDO PRESTAÇÃO          | `=(CARGA + TRANSFERENCIA + (-)TARIFA) - (-)PRESTAÇÃO DE CONTAS`               |
| S   | (-) SALDO CARTAO         | `=IFERROR(VLOOKUP([CPF], 'SALDO CARTAO'!K:L, 2, 0), 0)`                       |
| T   | **SALDO FINAL**          | `=SALDO PRESTAÇÃO - (-)SALDO CARTAO`                                          |
| U   | 1ª QZ                    | `=SUMIFS(QUINZENAS[VALOR], ...QUINZENA="1ª QZ", MÊS=$W$8, ANO=$W$7)`          |
| K   | GESTOR                   | `=VLOOKUP([REGIONAL], AUX!B:C, 2, 0)`                                         |
| L   | DIRETOR                  | `=VLOOKUP([REGIONAL], AUX!B:D, 3, 0)`                                         |

Parâmetros globais: `$W$7` = ANO, `$W$8` = MÊS.

---

## 4. De onde vem cada insumo do PAINEL na API (plano de automação)

| Insumo PAINEL            | Fonte planilha    | Fonte API / Neon                                                        | Status |
|--------------------------|-------------------|-------------------------------------------------------------------------|--------|
| COLABORADOR, CPF, SITUAÇÃO | (cadastro)      | `/v2/team-members` (name, cpf, active)                                  | ✅ |
| CENTRO DE CUSTO          | (cadastro)        | `/v2/team-members?include=costsCenters` → `costs_center.description`    | ✅ |
| REGIONAL                 | (cadastro)        | `/v2/approval-flows` (description) — derivado                           | ⚠️ derivar |
| GESTOR / DIRETOR         | AUX (lookup)      | tabela AUX regional→gestor/diretor (35 linhas, config manual)           | ⚠️ tabela fixa |
| **CARGA**                | EXTRATO "CARGA"   | extrato v3 Neon: `Transferência` **positiva** (REGIONAL > pessoa)       | 🔬 validar |
| **TRANSFERENCIA**        | EXTRATO "TRANSF." | extrato v3 Neon: `Transferência` **negativa** (pessoa > REGIONAL)       | 🔬 validar |
| **(-) TARIFA**           | EXTRATO "TARIFA"  | extrato v3 Neon: `Taxa`                                                  | 🔬 validar |
| **(-) SALDO CARTAO**     | aba SALDO CARTAO  | extrato v3 Neon: **snapshot** (`is_snapshot=true`, último antes do fech.)| ✅ temos |
| **(-) PRESTAÇÃO CONTAS** | BASE PREST        | `/v2/reports` + `/v2/expenses` (despesas justificadas no período)       | 🔬 validar |
| 1ª QZ / 2ª QZ            | QUINZENAS         | **entrada manual** (arquivo de quinzena que você sobe)                  | ❌ manual |
| Adiantamento, obs        | —                 | **entrada manual**                                                      | ❌ manual |

**Tipos no extrato v3 (Neon), maio/2026:** SNAPSHOT, Compra (−132k), Transferência
(+705k / −100k), Taxa (−4,8k), Saque (−412k), Pix (−53k), Estorno (+4k).
→ `Compra/Saque/Pix` são gastos que entram na **prestação de contas**, não na "carga".

---

## 5. Fórmula final consolidada (para o gerador dinâmico)

```python
# --- vindo do PAINEL (reproduzido da API/Neon) ---
saldo_prestacao = carga + transferencia + tarifa - prestacao_de_contas
painel_saldo_final = saldo_prestacao - saldo_cartao   # saldo_cartao = snapshot

# --- colunas da CARGA ---
carga_saldo_final      = max(painel_saldo_final, 0)
carga_saldo_reembolsar = max(-painel_saldo_final, 0)
carga_saldo_cartao     = saldo_cartao
col_1qz                = <ENTRADA MANUAL da quinzena>
adiantamento           = <ENTRADA MANUAL>  # quase sempre 0

# --- as 3 fórmulas vivas da CARGA ---
carga_parcial = col_1qz - carga_saldo_final - carga_saldo_cartao - adiantamento
reembolso     = carga_saldo_reembolsar * 0.5
carga_final   = (carga_parcial if carga_parcial > 0 else 0) + reembolso
```

---

## 6. Pendências de validação (antes de cravar 100%)

1. **CARGA/TRANSFERENCIA/TARIFA**: confirmar que o split de `Transferência`
   (positiva=CARGA, negativa=TRANSFERENCIA) e `Taxa`=TARIFA reproduz exatamente os
   valores do PAINEL para uma amostra de CPFs. (A aba EXTRATO do CONTROLE pode usar
   uma janela de datas/critério específico.)
2. **PRESTAÇÃO DE CONTAS**: confirmar que `/v2/reports`+`/v2/expenses` reproduz a
   coluna `AA` da BASE PREST por CPF/período.
3. **Janela temporal de cada SUMIFS**: o PAINEL usa `$W$7/$W$8` (ano/mês). Definir a
   janela exata por quinzena (acumulado do mês? do ano? até a data de fechamento?).
