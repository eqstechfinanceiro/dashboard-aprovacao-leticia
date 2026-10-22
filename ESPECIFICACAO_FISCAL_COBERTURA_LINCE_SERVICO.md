# ESPECIFICAÇÃO — Fiscal: cobertura completa das regras Lince + saneamento das notas de serviço

Data: 2026-10-22
Solicitante: Ítalo (setor fiscal / contas a pagar EQS-Bratec)
Escopo: dashboard `vexpenses-dashboard` (Next.js + Neon Postgres, VPS `179.199.149.43`,
`/var/www/dashboard-financeiro/vexpenses-dashboard`) — com referência ao bot
`Lince` (`C:\...\Letícia\Lince`, repo `github.com/eqstechfinanceiro/Lince`) e ao
runner `download-notas-de-servico` (`C:\...\Letícia\download-notas-de-servico`).

## 1. Contexto e motivação

O usuário levantou duas desconfianças — ambas confirmadas pela investigação:

**A. "O Lince aplica um monte de regras nas notas — estamos verificando de fato essas regras?"**
Resposta parcial: a conferência valida TES (mesma engine e mesma tabela de
overrides do Lince), valores, quantidades, CST e cabeçalho. **Mas o Lince
escreve mais campos do que a conferência compara**: alíquotas, bases de
cálculo, ICMS-ST por item, desconto, frete/seguro/despesa e duplicatas
passam sem verificação — um bug do bot nesses campos seria invisível.

**B. "Erros em massa nas notas de serviço: 'documento não encontrado' (mas o
card tem o documento) e falha técnica (PDFs sem texto)."**
Confirmado em produção (dados reais, 22/10/2026):

- `falha_tecnica` serviço: **127 notas** — 117 "PDF sem texto extraível",
  7 PDF corrompido/criptografado ("EOF marker", "decrypted", "trailer"),
  3 "sem documentos no portal". **122 têm documento anexado.**
- `pendente` serviço: **11 notas, todas com doc** — validação de substring
  falhou porque:
  - o anexo validado era **boleto** marcado como tipo 'G' (nota 8444 —
    ficha de compensação Itaú, não a NFS);
  - o número no PDF **não é o F1_DOC** (nota 31421: NFS-e 193 × doc TOTVS
    196 — ou anexo errado do mesmo processo, ou divergência real);
  - variantes de formato (fatura HAPVIDA de 63 páginas, nº 19934).

Objetivo: a conferência deve validar **tudo que o Lince escreve** (e
sinalizar o que ele não consegue decidir), e a fila de serviço deve medir o
problema real — não eco do pipeline frágil de substring.

## 2. Estado atual (mapa do código)

### 2.1 Conferência de mercadoria (server-side)

`lib/conferencia/sync.ts` (`syncConferencia`, worker `syncFiscalMonitor`,
janela 14d, ciclo ~45min): SF1+SA2 headers + SD1+SB1 itens via
`fetchMercadoriaNfs` (`F1_ESPECIE='SPED'`, EQS `02,02` + BRATEC `11,01`) →
XML via `fontes.ts` (cache `fiscal_doc_cache`, SIEG, Z01/SDS) →
`comparator.compareNf` → `fiscal_notas` (auto_status × checks).

`lib/conferencia/comparator.ts` — checks HOJE:

| Grupo | Checks | Fonte TOTVS | Fonte XML |
|---|---|---|---|
| Header | Documento, Série, Chave NFe, Dt. Emissão, CNPJ Fornecedor (SA2), Valor Total (±0,05), ICMS-ST (regra TES do item 1), Qtd. Itens | F1_* | infNFe |
| Item | Vlr. Total, Quantidade, Vlr. Unitário, TES (`definirTes` + `resolverTesOverride`), ICMS, IPI, Origem CST | D1_* | det[] |

`lib/conferencia/tes-rules.ts` — port fiel do `tes_rules.py` do Lince
(mesmos mapas `NATUREZA_CODIGO`, `DIFAL_MAP`, `ZERAR_*_POR_CONTEXTO`,
`CENTROS_CUSTO_ESPECIAIS`, `ITENS_ESPECIAIS`, USIMINAS). Overrides via
`lib/conferencia/tes-override.ts` → `lince_tes_fornecedores/produtos/mapa`
— **a mesma fonte que o bot consulta** em `/api/fiscal/tes-regras/lookup`.

Campos SD1 já buscados e **nunca comparados**: `D1_BASEICM`, `D1_BASEIPI`,
`D1_VALDESC`, `D1_ICMSRET`, `D1_CLASFIS` (parcial — CST). Campos válidos
na API e não buscados: `D1_PICM` (aliq ICMS), `D1_IPI` (aliq IPI — validar
semântica na impl.), `D1_VALFRE`, `D1_SEGURO`, `D1_DESPESA`, `D1_PEDIDO`,
`D1_ITEMPC`, `D1_BRICMS`. Campo ST de base/aliq: **não existe** em SD1 —
ST vive em `D1_ICMSRET` (valor) e `F1_ICMSRET` (header) — validado.

### 2.2 O que o Lince escreve (auditoria do repo, produção = `executar_batch`)

Grid SD1 (`documento_entrada_handler.COLUNAS`): TES, quantidade,
valor_unitario, desconto, ICMS {base, valor, aliq}, ICMSST {base, aliq,
valor}, IPI {base, valor, aliq}, frete/seguro/despesa (cols 117-119).
Header: TES do form + filial. Duplicata: **valor da parcela** + natureza
dominante — **vencimento nunca é editado nem conferido** (em nenhum dos
dois sistemas — ponto cego compartilhado). `natureza`, `centro_custo`,
`sit_tribut`/CST e `CFOP` do item são **lidos, nunca escritos** (CFOP
deriva da TES).

### 2.3 Gaps de cobertura confirmados (Lince × conferência)

| # | Campo que o Lince escreve | Conferência hoje | Gap |
|---|---|---|---|
| G1 | TES item | `definirTes` + overrides iguais | coberto |
| G2 | ICMS valor/base/aliq item | só **valor** (`D1_VALICMS`) | base+aliq |
| G3 | ICMS-ST base/aliq/valor item | só header via TES item 1 | item todo |
| G4 | IPI valor/base/aliq item | só **valor** (`D1_VALIPI`) | base+aliq |
| G5 | desconto item (`D1_VALDESC`) | informativo no header | item |
| G6 | frete/seguro/despesa item | não buscado | tudo |
| G7 | quantidade / vunit item | coberto | — |
| G8 | duplicata: valor parcela + natureza dominante (SE2) | nada | tudo |
| G9 | ctrl_imposto | `v>0` no XML | Lince usa `valor>0 OR base>0` — classificação diverge (BC>0 c/ valor=0) |
| G10 | natureza não mapeada (cód.8) / CC especial → Lince retorna TES `''` | `expectedTes=''` → `tesMatch=true` sempre | passa em silêncio |
| G11 | fracionamento 1-XML→N-SD1 | sem noção; mascarado por `valbrutMatch` | item diverge invisível |
| G12 | `valbrutMatch` força `match=true` em Vlr/Qtd/VUnit/ICMS/IPI | silencia divergência de item quando o total bate | revisar regra |

### 2.4 Pipeline de serviço (o segundo ponto)

Notas `tipo='servico'` são criadas **só pelo runner Python**
(`download-notas-de-servico`, roda no PC, push `POST /api/fiscal/import`):

1. `totvs_api.py` lista `F1_ESPECIE='NFS'` na REST e baixa **1º doc 'G'**
   do processo no portal EQS antigo.
2. `_extract_pdf_text` — **PyPDF2**. Falha → auto_status `erro`
   → `falha_tecnica` ("PDF sem texto extraível", "erro ao ler PDF").
3. `_validate_pdf` — substring no texto: `doc` (hard-fail), `valor`
   (hard-fail), `iss`/`irrf`/`inss` (warning) → `divergente` → `pendente`.
4. `push_dashboard.map_resultados` — converte cada parte do resumo em um
   check `{field: "doc 000000196 NÃO ENCONTRADO", match: "OK" in part}`.

`lib/fiscal/servico-docs.ts` (`syncServicoDocs`, warm cycle) anexa **todos**
os docs do processo (`fiscal_notas_docs`), mas a validação rodou **antes**
e só no primeiro doc — a nota continua com a acusação do anexo errado.

**Não há conferência de serviço server-side**: nada no dashboard puxa
`F1_ESPECIE='NFS'` nem revalida o PDF. O `fetchNfByIdentidade` (monitor de
canceladas) consulta SF1 por identidade, mas não gera nota nem valida doc.

## 3. Conceito / modelo

```
                         ┌───────────── MERCADORIA ─────────────┐
  Lince escreve ───────► │ SD1: TES, qtd, vunit, desconto,      │
                         │      ICMS/ST/IPI {base,valor,aliq},  │
                         │      frete/seguro/despesa            │
                         │ SE2: parcela valor + nat. dominante  │
                         └──────────────┬───────────────────────┘
                                        │ compareNf deve cobrir TUDO
                         ┌──────────────▼───────────────────────┐
                         │ comparator v2: item checks completos │
                         │ + duplicatas (SE2) + flags de decisão│
                         │ ("não verificável" ≠ "match")        │
                         └──────────────────────────────────────┘

                         ┌───────────── SERVIÇO ────────────────┐
  portal EQS (processo)─►│ fiscal_notas_docs: TODOS os anexos    │
                         │ validação por doc (melhor match)     │
                         │ texto: pdfjs │ PDF-imagem: metadados  │
                         │   do processo (wsrprocpag) — SEM OCR │
                         └──────────────────────────────────────┘
```

Princípio: **"não verificável" nunca vale "match"** — quando a regra do
Lince não consegue decidir (natureza cód.8, CC especial sem TES), a nota
leva check-informativo de blind spot, não aprovação silenciosa.

## 4. Modelo de dados

```sql
-- fiscal_notas_docs: texto extraído persistido (digitalização única)
ALTER TABLE fiscal_notas_docs
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS text_source TEXT,        -- 'embedded' | 'none' (imagem) | 'unreadable'
  ADD COLUMN IF NOT EXISTS text_extracted_at TIMESTAMPTZ;

-- fiscal_notas: proveniência da evidência usada na validação
ALTER TABLE fiscal_notas
  ADD COLUMN IF NOT EXISTS validated_doc_id BIGINT; -- qual anexo validou (NULL = doc_path)
```

`checks` mantém o shape `{field, expected, actual, match, missing_xml?}` —
novos campos de check reutilizam `field` ("Aliq ICMS", "Base ICMS",
"Desconto", "Frete", "Seguro", "Despesa", "Duplicatas", "Vencimento",
"ST Item", "Não verificável"). O `div_tipos` da fila já agrega por sufixo
— aparecem automaticamente no filtro de divergência.

## 5. APIs

Nenhuma rota nova em P0. Reuso:

- `GET /api/fiscal/fila` — já agrega `div_tipos` por campo de check.
- `POST /api/fiscal/import` — sem mudança (runner continua podendo push).
- **`POST /api/fiscal/servico-revalidar`** (novo, módulo `fiscal`): body
  `{ nota_ids?: number[], all?: boolean }` → roda a revalidação server-side
  sob demanda (mesma rotina do worker) e retorna resumo
  `{ revalidadas, promovidas_match, seguem_divergentes, seguem_falha }`.
  Útil pro botão "Reverificar" no card e pro backfill.

## 6. UX / UI

- Card expandido: checks novos aparecem na lista existente (grid de
  campo esperado×atual). Sem UI nova — o detalhe "validado contra o anexo
  `<nome>`" entra como `info` check ou na linha de docs (badge no anexo
  usado).
- Badge de divergência no card usa `div_tipos` — "Aliq ICMS" etc. aparecem.
- Nota serviço revalidada com sucesso em outro anexo: `auto_resumo` mostra
  "validado contra `<doc_nome>`".
- Falha técnica resolvida por metadados vira `auto_ok_aviso` com
  `auto_resumo` "conferido por metadados do processo (PDF imagem)".

## 7. Regras de negócio

### 7.1 Conferência mercadoria — novos checks por item (`comparator.ts`)

Para cada par TOTVS-item × XML-item (após o greedy match existente):

| Check | Esperado (XML) | Atual (SD1) | Match | Nota |
|---|---|---|---|---|
| Aliq ICMS | `p_icms` | `D1_PICM` | `cmpFloat` | skip se zerar contextual (regra `precisaZerarIcms` → esperado 0) |
| Base ICMS | `v_bc` | `D1_BASEICM` | `cmpFloat` | idem |
| Aliq IPI | `p_ipi` | `D1_IPI` | `cmpFloat` | idem `precisaZerarIpi` |
| Base IPI | `v_bc_ipi` | `D1_BASEIPI` | `cmpFloat` | idem |
| ST Item | `v_st` | `D1_ICMSRET` | `cmpFloat` ou zero-contextual | mesma regra do header, por item |
| Desconto | `v_desc` | `D1_VALDESC` | `cmpFloat` | — |
| Frete | `v_frete` | `D1_VALFRE` | `cmpFloat` | — |
| Seguro | `v_seg` | `D1_SEGURO` | `cmpFloat` | — |
| Despesa | `v_outro` | `D1_DESPESA` | `cmpFloat` | — |
| Pedido | — | `D1_PEDIDO`/`D1_ITEMPC` | `info` | evidência p/ vínculo SC7 |

`xml-parser.ts` precisa expor `p_icms`, `v_bc`, `v_bc_ipi`, `p_ipi`,
`v_frete`, `v_seg`, `v_outro`, `v_desc` por item (verificar o que já é
parseado — `v_icms`/`v_ipi`/`v_prod`/`cfop`/`cst`/`orig` existem).

**ctrl_imposto alinhado ao Lince (G9)**: `deriveCtrlImposto` passa a
`tem_imposto = valor>0 OR base>0` por imposto (mesma regra do bot —
`documento_entrada_handler._determinar_tipo`). Campos novos de base no
XML alimentam isso; enquanto a base não existir no parse, fallback ao
`valor>0` atual.

**Zeramento contextual (G2–G4)**: quando `precisaZerar*` diz que a TES
deveria zerar o imposto, esperado = `0` em valor **e** base **e** aliq —
exatamente o que o Lince escreve (0.0 nos três).

**"Não verificável" (G10)**: `definirTes` retorna `tes=''` com
`meta.regra_aplicada` ∈ `natureza_nao_mapeada | eqs_cod2_centro_especial_sem_tes |
tes_vazio_no_siga` → check `Não verificável: <regra>` `match=true`
**informativo** (visível, não reprova) + `auto_resumo` menciona. Não
entra em `mismatch_count` mas fica registrado — o fiscal vê que aquele
item está fora da cobertura.

**Fracionamento (G11)**: após o greedy 1:1, itens SD1 sem par e com mesmo
`D1_COD` (ou mapeando pro mesmo item XML por descrição) formam grupo;
se `Σ D1_TOTAL ≈ v_prod` e `Σ D1_QUANT ≈ q_com` (±0,02) → o grupo vira
um match único (checks de qtd/vunit sobre o agregado); senão diverge com
detalhe "esperado Σ X, lançado Σ Y".

**valbrutMatch (G12)**: manter o force-match **só quando** `!itemCountMatch`
ou o item ficou `missing_xml`. Com `itemCountMatch` + par resolvido, os
checks de valor avaliam de verdade — divergência real de item volta a
aparecer mesmo com total batendo.

### 7.2 Duplicatas (`sync.ts`, nova fonte)

Por nota conferida com `chave_acesso` válida ou par (doc,serie,fornecedor):
- `SE2` por `E2_NUM=doc AND E2_FORNECE=sa2 AND E2_LOJA=loja` — parcelas
  `E2_PARCELA`, `E2_VALOR`, `E2_VENCTO`, `E2_NATUREZ`.
- XML: `cobr.dup[]` → `nDup`, `dVenc`, `vDup` (adicionar ao parser).
- Checks:
  - `Qtd. parcelas` — count SE2 vs count dup XML (hard).
  - `Vlr. parcela <n>` — cada vDup vs E2_VALOR mesma posição (hard, ±0,10
    — mesma tolerância do Lince `processar_duplicatas`).
  - `Natureza duplicata` — natureza dominante SE2 vs natureza da NF (info;
    o Lince grava a dominante — divergência aqui é warning).
  - `Vencimento parcela <n>` — `info` (o Lince não confere vencimento;
    cond. pagto pode mudar o vencimento legitimamente — warning-only).

### 7.3 Serviço — validação server-side (`lib/fiscal/servico-validar.ts`, novo)

Port do `_validate_pdf` (`totvs_api.py:455-549`) em TS:

1. Candidatos de doc: `doc`, `doc.lstrip('0')`, `doc` com separador de
   milhar antes dos 3 últimos dígitos, e os **9–10 dígitos finais da chave
   NFS-e** quando presente no texto (DANFSe mostra chave; o nº da nota
   está embutido nela).
2. Valor: `_find_amount_in_text` portado (mesmos formatos BR/EN + `R$`).
3. ISS/IRRF/INSS: warnings (`match=true`, anotado).
4. **Multi-doc**: extrai texto de **todos** os docs (`fiscal_notas_docs` +
   `doc_path`) via pdfjs `extractPdfText` (tolerante — resolve EOF/
   trailer/decrypted onde PyPDF2 morre). Texto persistido em
   `fiscal_notas_docs.extracted_text` com `text_source='embedded'`.
5. A nota valida quando **algum** doc tem doc+valor encontrados (o doc
   vira `validated_doc_id` — evidência real, não "o primeiro"). Nenhum
   casa → divergente com detalhe "nenhum dos N anexos confere
   doc+valor".
6. Doc sem texto nenhum → `text_source='none'` e vai pra validação por
   metadados (7.4), não a falha imediata.

### 7.4 PDF imagem — validação por metadados do processo (SEM OCR)

O usuário vetou OCR — inclusive extração vision. O caminho estruturado:

1. `eqsGetProcesso(doc, fornecedor_cod, tenant)` (já existe em
   `eqs-portal.ts`) retorna o processo: `CDSDOC`, `CDSSERIE`,
   `CDSFORNEC`, `CDSLOJA`, `NDSVLNF` (valor NF), `NDSVALMERC`,
   `DDSEMISSA`, `CENTNOME`, `CDSSTATUS`. (Verificado ao vivo —
   processo 488015 traz todos.)
2. Checks por metadados (nota × processo):
   - `Doc` — CDSDOC == n.doc (hard)
   - `Valor` — NDSVLNF ≈ n.valor ±0,10 (hard)
   - `Fornecedor` — CDSFORNEC == SA2 resolvido (hard)
   - `Emissão` — DDSEMISSA == n.emissao (warning)
   - `Conteúdo do PDF` — `match=true` informativo: "imagem — conferido
     por metadados do processo".
3. Todos hard batem → `auto_ok_aviso` (conferência por metadados, não
   por leitura — o fiscal sabe que o conteúdo não foi lido).
   Qualquer hard falha → `pendente` com o campo divergente.
4. Processo inexistente (`proc_nao_encontrado`) → segue `falha_tecnica`
   com resumo "sem processo no portal — anexar manualmente".

**Backfill inicial**: varre as 122 notas `falha_tecnica` com doc + as 11
`pendente` — job idempotente, batch de ~15/run no warm cycle, meta no
`conferencia_state.fontes` (reuso do padrão `servico_docs`).

### 7.5 Cobertura de serviço independente do runner (P1)

`fetchHeaders(tenant, from, to, 'NFS')` já funciona — mesma genericQuery.
Novo `syncServico` no warm cycle: cria `fiscal_notas` `tipo='servico'`
para NFS do SF1 sem linha (doc+fornecedor+emissao, `review_status`
inicial `'pendente'` até validar doc), dispara `syncServicoDocs` +
validação 7.3/7.4. O runner vira otimização, não pré-requisito.

## 8. Fluxos de ponta a ponta

**Mercadoria — happy path**: ciclo warm → NF nova → XML cache →
`compareNf` com checks completos (item + duplicata) → `auto_ok`. Qualquer
campo Lince-escrito divergindo → `pendente` com o check específico.

**Mercadoria — blind spot**: natureza cód.8 → TES sem esperado → checks
"Não verificável" + `auto_ok` (não reprova, mas fica à vista; filtro
`div=Não verificável` lista todas).

**Serviço — anexo errado**: processo tem boleto + NFS → `syncServicoDocs`
anexa ambos → validação acha doc+valor na NFS (outro doc) → `auto_ok`,
`validated_doc_id` ≠ doc_path, resumo mostra qual anexo validou.

**Serviço — PDF escaneado**: falha_tecnica → pdfjs confirma `none` →
metadados do processo conferem doc/valor/fornecedor → `auto_ok_aviso`.
PDF de 63 páginas (fatura): `maxPages` de extração sobe pra cobrir
(parâmetro).

**Serviço — doc no PDF ≠ F1_DOC de verdade**: nenhum anexo confere →
`pendente` "nenhum dos N anexos confere" — o fiscal decide (divergência
real de digitação, como a 31421 pode ser).

## 9. Fases de entrega

- **P0 — Cobertura Lince completa**: checks de item (aliq/base/ST/
  desconto/frete/seguro/despesa), ctrl_imposto alinhado, "Não
  verificável", refinamento `valbrutMatch`, duplicatas SE2×XML.
  Backfill: re-rodar conferência na janela (resetar `review_status` não
  confirmado pra reprocessar).
- **P0 — Serviço multi-doc + texto embutido**: `servico-validar.ts`
  (pdfjs, todos os anexos, doc candidates ricos, `validated_doc_id`,
  `extracted_text` persistido) + `POST /api/fiscal/servico-revalidar` +
  backfill das 11 pendentes e das 7 corrompidas (pdfjs pode salvar várias).
- **P1 — PDF-imagem via metadados**: validação por `wsrprocpag` (7.4) +
  integração no warm cycle + backfill dos 117 "sem texto". Esperado: a
  maior parte vira `auto_ok_aviso`; o resto fica `pendente` com
  divergência real ou `falha_tecnica` honesta (sem processo).
- **P1 — Cobertura serviço server-side**: `syncServico` (SF1 NFS direto)
  — elimina a dependência do runner.
- **P2 — Polimento**: badge "anexo validado" no card, checks dead-code
  do Lince que nunca rodam (desconto-100% transferência, vUnit≥2× —
  como warnings), vencimento de parcela (warning — confirmado pelo
  usuário).

## 10. Decisões abertas

| # | Decisão | Recomendação |
|---|---|---|
| ~~D1~~ | ~~OCR~~ | **decidido: sem OCR** — PDF-imagem valida por metadados do processo (`wsrprocpag`); sem processo → `falha_tecnica` honesta. |
| D2 | Validar serviço em todos os anexos vs só doc_path | **Todos** — o 'G' escolhido pelo runner já provou ser boleto em caso real; o anexo que valida vira evidência (`validated_doc_id`). |
| D3 | Duplicata vencimento: hard ou warning | **warning** — o Lince não confere; cond. pagto altera vencimento legitimamente. Valor+quantidade ficam hard. |
| D4 | `valbrutMatch` force-match | **só quando `!itemCountMatch` ou `missing_xml`** — caso contrário esconde divergência de item com total batendo. |
| D5 | "Não verificável" reprova? | **não** (`match=true` informativo) — mas sai do silêncio: visível no card + filtrável. Reprovar criaria fila sem dono. |
| D6 | Cobertura serviço server-side (SF1 NFS direto) | **sim (P1)** — o runner é gargalo manual no PC; a query já existe. |
| D7 | PDF pesquisável (camada de texto no arquivo) | **P2 opcional** — o valor está no texto persistido; regravar PDF é custo sem retorno funcional imediato. |
| D8 | Aliq/base divergentes reprovam? | **hard match** como os valores — o Lince os escreve da mesma fonte; divergência é erro de fato. (CST segue warning-only.) |

## 11. Critérios de aceite

- [ ] `compareNf` emite checks `Aliq ICMS`, `Base ICMS`, `Aliq IPI`,
      `Base IPI`, `ST Item`, `Desconto`, `Frete`, `Seguro`, `Despesa` por
      item casado.
- [ ] `deriveCtrlImposto` usa `valor>0 OR base>0` (paridade com
      `documento_entrada_handler._determinar_tipo`).
- [ ] Item com `definirTes→tes=''` gera check "Não verificável:
      <regra_aplicada>" e **não** `TES match`.
- [ ] NF com itens casados e total batendo ainda acusa divergência de
      valor unitário quando houver (não é mascarada por `valbrutMatch`).
- [ ] Grupo fracionado (1 item XML → N linhas SD1 mesmo produto, Σ igual)
      valida como match; Σ diferente diverge com detalhe.
- [ ] Checks `Qtd. parcelas` + `Vlr. parcela n` por nota com duplicatas
      (SE2 × cobr.dup); vencimento informativo.
- [ ] Nota 8444 (boleto anexado): após `syncServicoDocs` + revalidação,
      valida contra outro anexo do processo ou fica divergente com
      motivo correto — nunca "doc não encontrado" por causa do boleto.
- [ ] `POST /api/fiscal/servico-revalidar` retorna resumo e promove
      `pendente→auto_ok` quando um anexo confere.
- [ ] Backfill: as 11 pendentes e os PDFs corrompidos (7) revalidados;
      contagem final reportada.
- [ ] Metadados: ≥80% dos 117 "sem texto" saem de `falha_tecnica` após o
      backfill — `auto_ok_aviso` quando doc/valor/fornecedor conferem no
      processo; `fiscal_notas_docs.extracted_text`/`text_source` gravados;
      revalidação usa texto persistido (zero re-extração).
- [ ] `syncServico` cria linha de serviço para NFS do SF1 ausente (P1).
- [ ] `npx tsc --noEmit` limpo; `build:worker` ok; deploy + health 200.

## 12. Plano de testes E2E

1. **Unitário mental → DB real**: escolher 3 NFs mercadoria em produção
   (uma com ICMS, uma com ST, uma fracionada) — rodar `compareNf` novo em
   script debug no VPS e imprimir checks; comparar aliq/base/ST com o
   grid real do Protheus.
2. **Duplicata**: NF com parcelas — conferir `SE2`×`cobr.dup` manualmente.
3. **Serviço boleto**: nota 8444 — anexar docs, revalidar, conferir que
   o boleto não é escolhido e o motivo fica correto.
4. **Metadados**: nota falha com processo no portal → `auto_ok_aviso`;
   nota com processo divergente → `pendente` com o campo; sem processo
   → segue `falha_tecnica` "sem processo".
5. **API**: `POST /api/fiscal/servico-revalidar` `{all:true}` num batch
   pequeno — resposta com contagens; `GET /api/fiscal/fila?tipo=servico`
   antes/depois.
6. **Browser**: `/fiscal` — card de serviço resolvido por metadados sai
   de falha (`auto_ok_aviso`); card mercadoria mostra os novos checks;
   filtro `div` lista os novos tipos. `/borderos` intacta.
