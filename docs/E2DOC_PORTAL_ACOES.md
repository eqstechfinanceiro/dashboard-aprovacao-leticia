# e2doc — Ações de pasta via portal web (edição/exclusão de índices)

A API REST (`api.e2doc.com.br`) só expõe **Consulta** e **Sincronismo** (envio).
Não há endpoint REST para editar índices de pasta nem excluir — essas operações
existem no portal MVC (`www.e2doc.com.br`) e podem ser automatizadas por HTTP.

Login web: `POST /login` com `Empresa`(=keybase), `Login`, `Senha` +
`__RequestVerificationToken` (do GET /login). Mesmas credenciais da API.

## Fluxo de pesquisa (sessão stateful — seguir a ordem)

1. `GET /Pesquisa/Filtro` → extrai `__RequestVerificationToken` da página
2. `POST /Pesquisa/Filtro` (XHR) com `ModeloPasta=<id>` + campos de índice
   `CI_0..CI_8` (labels/ordem vêm de `GET /Pesquisa/ListaCamposIndexacao?modeloID=<id>`).
   FINANCEIRO - DP = **290**; CI_0=COMPETÊNCIA, CI_1=CPF, CI_2=NOME, CI_3=BANCO,
   CI_4=REGIÃO, CI_5=CENTRO DE CUSTO, CI_6=PEDIDO, CI_7=SINDICATO, CI_8=ESTADO.
   Retorna JSON `{CodigoRetorno:2, UrlRedirect:"/Pesquisa/Pasta"}`.
3. `GET /Pesquisa/Pasta` → **obrigatório** (materializa o estado da busca na sessão)
4. `POST /Pesquisa/PastaLoad` (XHR, payload DataTables server-side: draw/start/length/
   columns[i][data|searchable|orderable|search[...]]/order[0][...]/search[...]).
   Retorna `{data:[{Key:"<hexID>,<emOperacao>", Checked, <índices>...}]}`.

## Editar índices da pasta (ex.: corrigir COMPETÊNCIA)

5. `POST /Pesquisa/PastaCheck?pastaID=<hexID>` → seleciona (toggle!)
6. `POST /Pesquisa/PastasSelecionadas` → devolve ID numérico da pasta
7. `POST /PesquisaAcao/ValidarEdicaoLoq?pastaID=<numID>` → `CodigoRetorno:1` = ok
   (falha se doc em check-out)
8. `GET /PesquisaAcao/Editar?pastaID=<numID>` → partial HTML: RVT + PastaID +
   CI_0..CI_8 com valores atuais (input/textarea/select `selected`)
9. `POST /PesquisaAcao/ValidarCamposEdicao` (form serialize) → `CodigoRetorno:1` = válido
10. `POST /PesquisaAcao/Editar` (form serialize: RVT + PastaID + CI_0..8) → `CodigoRetorno:1` = salvo
11. `POST /Pesquisa/PastaCheck?pastaID=<hexID>` de novo → desseleciona

## Excluir pasta/documentos

`GET /PesquisaAcao/Excluir?pastaID=<id>&documentos=<ids>&versoes=<ids>`
(retorna msg de sucesso ou '' = permissão negada). Documentos/versoes IDs vêm
da página `/Pesquisa/Documento?pastaID=<hexID>`.

## Verificação pós-operação (fonte de verdade)

REST `POST /Consulta/Consultar` com `{modelo:"FINANCEIRO - DP", indices:[{label:"CPF",operador:"IGUAL",valor:<cpf>}]}` —
confere índices novos + `documentos[].modelo` intacto.

## Cuidados

- Portal é stateful por cookie de sessão (ASP.NET); manter o mesmo cookie jar
  durante todo o fluxo.
- `PastaCheck` é **toggle** — sempre desmarcar depois de agir para não arrastar
  seleção para a próxima pesquisa (conferir `PastaCheckCountSelecionadas` = 1 antes de editar).
- `PastasSelecionadas` retorna ID **numérico**; `PastaLoad.Key` traz ID **hex** —
  são representações diferentes da mesma pasta.
- Sempre validar no form de edição que os valores atuais batem com o esperado
  (comp errada + CPF + BANCO) antes de submeter.

## Caso real (07/10/2026)

Run 41 da remessa BB indexou 21 pastas com COMPETÊNCIA=10/2026 (devia ser
09/2026). Corrigidas por edição direta via esse fluxo — script ad-hoc na VPS,
zero exclusões necessárias. Banco local (`comprovantes_envios.competencia` e
`comprovantes_runs.selection.competencia`) alinhado depois.
