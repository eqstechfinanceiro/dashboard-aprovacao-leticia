"""
Checks de coluna para a tabela carga_1qz_planilha1.
Fonte: CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx → Planilha1

Chave de junção com a API: CPF (coluna 'cpf' no SQLite)

Para adicionar um novo check nesta tabela:
  1. Crie uma classe que herda de ColumnCheck (ou use o atalho yellow())
  2. Implemente o método run(db_conn, api_client_module)
  3. Adicione a instância na lista ALL_CHECKS no final deste arquivo
"""
import sqlite3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, CheckResult, Mismatch, yellow

TABLE = "carga_1qz_planilha1"


def _load_db_rows(db_conn: sqlite3.Connection) -> list[dict]:
    cur = db_conn.execute(f'SELECT * FROM "{TABLE}"')
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _normalize(s) -> str:
    return str(s or "").strip().upper()


# ---- Checks que comparam com a API ----

class ColaboradorCheck(ColumnCheck):
    """COLABORADOR (A): nome do colaborador → API team-members.name"""

    def run(self, db_conn, api) -> CheckResult:
        members = api.get_team_members()
        api_by_cpf = {m["cpf"]: m["name"] for m in members if m.get("cpf")}
        rows = _load_db_rows(db_conn)

        result = CheckResult(status="green", note="", total=len(rows))
        for row in rows:
            cpf = _normalize(row.get("cpf"))
            db_val = _normalize(row.get("colaborador"))
            if not cpf:
                result.not_found += 1
                continue
            if cpf not in api_by_cpf:
                result.not_found += 1
                continue
            api_val = _normalize(api_by_cpf[cpf])
            if db_val == api_val:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=cpf, db_value=db_val, api_value=api_val))

        _set_status(result)
        result.note = _summary_note(result, "name", "team-members")
        return result


class CpfCheck(ColumnCheck):
    """CPF (B): CPF do colaborador → API team-members.cpf (chave de junção)"""

    def run(self, db_conn, api) -> CheckResult:
        members = api.get_team_members()
        api_cpfs = {m["cpf"] for m in members if m.get("cpf")}
        rows = _load_db_rows(db_conn)

        result = CheckResult(status="green", note="", total=len(rows))
        for row in rows:
            cpf = _normalize(row.get("cpf"))
            if not cpf:
                result.not_found += 1
                continue
            if cpf in api_cpfs:
                result.matched += 1
            else:
                result.not_found += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=cpf, db_value=cpf, api_value="não encontrado"))

        _set_status(result)
        result.note = _summary_note(result, "cpf", "team-members")
        return result


class SituacaoCheck(ColumnCheck):
    """SITUAÇÃO (C): status do colaborador → API team-members.active (ATIVO/INATIVO)"""

    _MAP = {True: "ATIVO", False: "INATIVO"}

    def run(self, db_conn, api) -> CheckResult:
        members = api.get_team_members()
        api_by_cpf = {m["cpf"]: self._MAP.get(m.get("active"), "DESCONHECIDO")
                      for m in members if m.get("cpf")}
        rows = _load_db_rows(db_conn)

        result = CheckResult(status="green", note="", total=len(rows))
        for row in rows:
            cpf = _normalize(row.get("cpf"))
            db_val = _normalize(row.get("situação"))
            if not cpf or cpf not in api_by_cpf:
                result.not_found += 1
                continue
            api_val = api_by_cpf[cpf]
            if db_val == api_val:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=cpf, db_value=db_val, api_value=api_val))

        _set_status(result)
        result.note = _summary_note(result, "active (ATIVO/INATIVO)", "team-members")
        return result


class CentroCustoCheck(ColumnCheck):
    """CENTRO DE CUSTO (E): centro de custo → API team-members?include=costsCenters"""

    def run(self, db_conn, api) -> CheckResult:
        members = api.get_team_members(include="costsCenters")
        api_by_cpf: dict[str, set[str]] = {}
        for m in members:
            if not m.get("cpf"):
                continue
            cc_names = {
                _normalize(c["name"])
                for c in m.get("costsCenters", {}).get("data", [])
            }
            api_by_cpf[m["cpf"]] = cc_names

        rows = _load_db_rows(db_conn)
        result = CheckResult(status="green", note="", total=len(rows))

        for row in rows:
            cpf = _normalize(row.get("cpf"))
            db_val = _normalize(row.get("centro_de_custo"))
            if not cpf or cpf not in api_by_cpf:
                result.not_found += 1
                continue
            api_centers = api_by_cpf[cpf]
            if db_val in api_centers:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(
                        Mismatch(key=cpf, db_value=db_val,
                                 api_value=", ".join(sorted(api_centers)) or "(nenhum)")
                    )

        _set_status(result)
        result.note = _summary_note(result, "costsCenters", "team-members")
        return result


# ---- Helpers internos ----

def _set_status(result: CheckResult):
    if result.mismatched > 0:
        result.status = "red"
    elif result.matched == 0:
        result.status = "yellow"
    else:
        result.status = "green"


def _summary_note(r: CheckResult, api_field: str, endpoint: str) -> str:
    if r.status == "green":
        return f"✓ {r.matched}/{r.total} linhas batem com {endpoint}.{api_field}"
    if r.status == "red":
        return f"✗ {r.mismatched} divergências de {r.total} linhas. API: {endpoint}.{api_field}"
    return f"API não retornou correspondência para {r.not_found}/{r.total} linhas"


# ---- Registro de todos os checks desta tabela ----

ALL_CHECKS: list[ColumnCheck] = [
    ColaboradorCheck(
        table=TABLE, column="colaborador", display="COLABORADOR",
        description="Nome do colaborador — via team-members.name (join por CPF)"
    ),
    CpfCheck(
        table=TABLE, column="cpf", display="CPF",
        description="CPF do colaborador — chave de junção com team-members"
    ),
    SituacaoCheck(
        table=TABLE, column="situação", display="SITUAÇÃO",
        description="Status ativo/inativo — via team-members.active"
    ),
    yellow(TABLE, "regional", "REGIONAL", "Regional do colaborador",
           "Não disponível diretamente na API. Derivado de approval-flows ou combinação de dados."),
    CentroCustoCheck(
        table=TABLE, column="centro_de_custo", display="CENTRO DE CUSTO",
        description="Centro de custo — via team-members?include=costsCenters"
    ),
    yellow(TABLE, "gestor", "GESTOR", "Gestor responsável",
           "Não disponível na API. Requer mapeamento manual ou integração com outro sistema."),
    yellow(TABLE, "diretor", "DIRETOR", "Diretor responsável",
           "Não disponível na API. Requer mapeamento manual."),
    yellow(TABLE, "saldo_reembolsar", "SALDO REEMBOLSAR",
           "Saldo a reembolsar do cartão",
           "Saldos de cartão não são expostos pela API VExpenses (/v2/balances retorna 405)."),
    yellow(TABLE, "saldo_final", "SALDO FINAL",
           "Saldo final do cartão",
           "Saldos de cartão não são expostos pela API VExpenses (/v2/balances retorna 405)."),
    yellow(TABLE, "col_1ª_qz", "1ª QZ",
           "Valor da 1ª quinzena",
           "Dado proveniente de sistema externo à VExpenses. Não disponível via API."),
    yellow(TABLE, "saldo_cartao", "SALDO CARTAO",
           "Saldo do cartão VExpenses",
           "Saldos de cartão não são expostos pela API VExpenses."),
    yellow(TABLE, "adiantamento", "Adiantamento",
           "Adiantamento concedido",
           "Adiantamentos não são expostos diretamente pela API VExpenses."),
    yellow(TABLE, "carga_parcial", "CARGA PARCIAL",
           "Fórmula Excel: 1ªQZ − SALDO_FINAL − SALDO_CARTAO − Adiantamento",
           "Coluna calculada por fórmula Excel. Depende de colunas não disponíveis na API."),
    yellow(TABLE, "reembolso", "REEMBOLSO",
           "Fórmula Excel: SALDO_REEMBOLSAR × 0,5",
           "Coluna calculada por fórmula Excel. Depende de SALDO_REEMBOLSAR não disponível na API."),
    yellow(TABLE, "carga_final", "Carga Final",
           "Fórmula Excel: MAX(0, CARGA_PARCIAL) + REEMBOLSO",
           "Coluna calculada por fórmula Excel. Depende de colunas não disponíveis na API."),
    yellow(TABLE, "obs", "obs",
           "Observações manuais",
           "Campo de anotação manual, não existe na API."),
    yellow(TABLE, "status_do_cartão", "STATUS DO CARTÃO",
           "Status do cartão VExpenses",
           "Status de cartão não é exposto pela API VExpenses (/v2/cards retorna 405)."),
]
