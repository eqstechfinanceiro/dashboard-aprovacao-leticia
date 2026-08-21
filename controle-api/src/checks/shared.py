"""
Shared check classes for common column types across multiple tables.
These can be reused across different controle tables.
"""
import sqlite3
import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, CheckResult, Mismatch


def _normalize(s) -> str:
    return str(s or "").strip().upper()


def _safe_float(val) -> float:
    try:
        return float(val) if val else 0.0
    except (ValueError, TypeError):
        return 0.0


def _normalize_date(date_str) -> str:
    """Normaliza data para formato YYYY-MM-DD para comparação."""
    if not date_str:
        return ""
    
    # Se já está no formato YYYY-MM-DD, retorna apenas a data
    if " " in str(date_str):
        return str(date_str).split(" ")[0]
    
    # Se está no formato DD/MM/YYYY, converte para YYYY-MM-DD
    if "/" in str(date_str):
        parts = str(date_str).split("/")
        if len(parts) == 3:
            day, month, year = parts
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    
    return str(date_str)


def get_diretor_regional(user_id, api, centro_custo=None) -> str:
    """Obtém o diretor regional de um usuário via centro de custo (mais preciso que approval flow).
    
    Args:
        user_id: ID do usuário na API
        api: Instância do API client
        centro_custo: Centro de custo opcional para mapeamento mais preciso
    
    Returns:
        Nome do diretor regional
    """
    try:
        members = api.get_team_members()
        user = next((m for m in members if m["id"] == user_id), None)
        if not user:
            return ""
        
        # Mapeamento de centro de custo para diretor (baseado na investigação)
        # Mais preciso que approval flow, pois resolve os conflitos
        cc_to_director = {
            "3R PETROLEUM NE": "ROGERIO SCATAMBULO",
            "ACELEN AR": "ROGERIO SCATAMBULO",
            "ADM FILIAL MG": "ROGERIO SCATAMBULO",
            "ADM FILIAL RJ": "ROGERIO SCATAMBULO",
            "ADM FILIAL RS": "EVERSON GAIDSTIECHI",
            "ADM FILIAL SC": "EVERSON GAIDSTIECHI",
            "ADM FILIAL SP": "EVERSON GAIDSTIECHI",
            "ADMINISTRATIVO": "THIAGO NEVES",
            "ARTERIS LITORAL SUL SC": "EVERSON GAIDSTIECHI",
            "BANCO CENTRAL PREDIAL SP": "EVERSON GAIDSTIECHI",
            "BANCO ITAU BA": "ROGERIO SCATAMBULO",
            "BANCO ITAU SP": "EVERSON GAIDSTIECHI",
            "BB ARAPIRACA MACEIO AL": "ROGERIO SCATAMBULO",
            "BB DIVINOPOLIS MG": "ROGERIO SCATAMBULO",
            "BB MARANHAO MA": "ROGERIO SCATAMBULO",
            "BB NORTE OESTE PR": "EVERSON GAIDSTIECHI",
            "BB POA RS": "EVERSON GAIDSTIECHI",
            "BB PREDIAL MS": "ROGERIO SCATAMBULO",
            "BB RUA RJ MG": "ROGERIO SCATAMBULO",
            "BB SERET SC": "EVERSON GAIDSTIECHI",
            "BB SHOPPING ESTACAO PR": "EVERSON GAIDSTIECHI",
            "BB SUDESTE MG": "ROGERIO SCATAMBULO",
            "BB TAMOIOS MG": "ROGERIO SCATAMBULO",
            "CARMO ENERGY": "ROGERIO SCATAMBULO",
            "CCBB BH MINAS": "ROGERIO SCATAMBULO",
            "CEF AM AC RR": "ROGERIO SCATAMBULO",
            "CEF BAURU SP": "EVERSON GAIDSTIECHI",
            "CEF BELEM FACILITIES PA": "ROGERIO SCATAMBULO",
            "CEF CAMPOS RJ": "ROGERIO SCATAMBULO",
            "CEF CEARA": "ROGERIO SCATAMBULO",
            "CEF CENTRO GAUCHO RS": "EVERSON GAIDSTIECHI",
            "CEF CENTRO NORTE SUL RJ": "ROGERIO SCATAMBULO",
            "CEF ES": "MARCOS CARIAS",
            "CEF EXTREMO SUL RS": "EVERSON GAIDSTIECHI",
            "CEF FAC RO": "ROGERIO SCATAMBULO",
            "CEF FACILITIES CAMPINAS SP": "EVERSON GAIDSTIECHI",
            "CEF FACILITIES CE": "ROGERIO SCATAMBULO",
            "CEF GOIANIA CO": "ROGERIO SCATAMBULO",
            "CEF INTERIOR RJ": "ROGERIO SCATAMBULO",
            "CEF LESTE GAUCHO RS": "EVERSON GAIDSTIECHI",
            "CEF LESTE SP": "EVERSON GAIDSTIECHI",
            "CEF NORDESTE MG": "ROGERIO SCATAMBULO",
            "CEF NORTE GAUCHO RS": "EVERSON GAIDSTIECHI",
            "CEF NORTE PA": "ROGERIO SCATAMBULO",
            "CEF NORTE PR": "EVERSON GAIDSTIECHI",
            "CEF NORTE SC": "EVERSON GAIDSTIECHI",
            "CEF OESTE SC": "EVERSON GAIDSTIECHI",
            "CEF PIRACICABA SP": "EVERSON GAIDSTIECHI",
            "CEF PORTO ALEGRE RS": "EVERSON GAIDSTIECHI",
            "CEF SERRA GAUCHA RS": "EVERSON GAIDSTIECHI",
            "CEF SP SUL": "EVERSON GAIDSTIECHI",
            "CEF VALE SINOS RS": "EVERSON GAIDSTIECHI",
            "CEF VOLTA REDONDA RJ": "ROGERIO SCATAMBULO",
            "CELESC NORTE SC": "EVERSON GAIDSTIECHI",
            "CLARO INFRA MG": "ROGERIO SCATAMBULO",
            "CLARO INFRA NORDESTE": "ROGERIO SCATAMBULO",
            "CLARO INFRA PR": "EVERSON GAIDSTIECHI",
            "CLARO INFRA RS": "EVERSON GAIDSTIECHI",
            "CLARO INFRA SC": "EVERSON GAIDSTIECHI",
            "COMERCIAL": "FELIPE FONTAN",
            "CORREIOS SAO JOSE SC": "EVERSON GAIDSTIECHI",
            "DETRONICS": "ROGERIO SCATAMBULO",
            "DIRETORIA TECNICA": "FERNANDA ARAGÃO",
            "FINANCEIRO": "DANIEL DUARTE",
            "GHC ARCON RS": "EVERSON GAIDSTIECHI",
            "INSS MT": "ROGERIO SCATAMBULO",
            "NET APOIO RS": "EVERSON GAIDSTIECHI",
            "NET CAXIAS RS": "EVERSON GAIDSTIECHI",
            "NET CENTRO RS": "EVERSON GAIDSTIECHI",
            "NET FLORIANOPOLIS SC": "EVERSON GAIDSTIECHI",
            "NET LESTE MG": "ROGERIO SCATAMBULO",
            "NET LITORAL PR": "EVERSON GAIDSTIECHI",
            "NET LITORAL RS": "EVERSON GAIDSTIECHI",
            "NET MGA PR": "EVERSON GAIDSTIECHI",
            "NET NORTE SC": "EVERSON GAIDSTIECHI",
            "NET PORTO ALEGRE RS": "EVERSON GAIDSTIECHI",
            "NET SERRA RS": "EVERSON GAIDSTIECHI",
            "NET SUDOESTE PR": "EVERSON GAIDSTIECHI",
            "NET VIDEIRA SC": "EVERSON GAIDSTIECHI",
            "OI PREDIAL E LIMPEZA SC": "EVERSON GAIDSTIECHI",
            "POLICIA FEDERAL BA": "ROGERIO SCATAMBULO",
            "PTB AREAS VERDES SC": "EVERSON GAIDSTIECHI",
            "PTB CENPES RJ": "ROGERIO SCATAMBULO",
            "PTB EDISE RJ": "ROGERIO SCATAMBULO",
            "PTB LUBNOR CE": "ROGERIO SCATAMBULO",
            "PTB REDUC RJ": "ROGERIO SCATAMBULO",
            "PTB REVAP REVITALIZACAO": "EVERSON GAIDSTIECHI",
            "PTB REVAP SP": "THIAGO NEVES",
            "PTB TIC INFRA": "EVERSON GAIDSTIECHI",
            "PTB TIC NORDESTE": "ROGERIO SCATAMBULO",
            "PTB TRANSMISSAO BA": "ROGERIO SCATAMBULO",
            "QSMS OPERACAO": "THIAGO NEVES",
            "TELEFONICA CO": "ROGERIO SCATAMBULO",
            "TELEFONICA MG": "ROGERIO SCATAMBULO",
            "TELEFONICA NE": "ROGERIO SCATAMBULO",
            "TELEFONICA RS": "EVERSON GAIDSTIECHI",
            "TELEFONICA SC": "EVERSON GAIDSTIECHI",
            "TI": "THIAGO NEVES",
            "TJ APOIO PR": "EVERSON GAIDSTIECHI",
            "TRIBUNAL DE JUSTICA PR": "EVERSON GAIDSTIECHI",
            "UFPR PR": "EVERSON GAIDSTIECHI",
        }
        
        # Se o centro de custo for fornecido e estiver no mapeamento, usa ele
        if centro_custo and centro_custo in cc_to_director:
            return cc_to_director[centro_custo]
        
        # Fallback para approval flow
        approval_flow_id = user.get("approval_flow_id")
        if not approval_flow_id:
            return ""
        
        # Mapeamento manual de approval_flow_id para nome de diretor
        # Baseado na investigação dos dados - usando o diretor mais comum por flow
        flow_to_director = {
            172530: "ROGERIO SCATAMBULO",  # REGIONAL CO
            172531: "ROGERIO SCATAMBULO",  # REGIONAL MG
            172532: "EVERSON GAIDSTIECHI", # REGIONAL RS
            172533: "FELIPE FONTAN",      # DIRETORIA
            172534: "EVERSON GAIDSTIECHI", # REGIONAL SC (maioria)
            172535: "ROGERIO SCATAMBULO",  # REGIONAL NE
            172536: "ROGERIO SCATAMBULO",  # REGIONAL BA
            172537: "EVERSON GAIDSTIECHI", # REGIONAL SP (maioria)
            172540: "THIAGO NEVES",      # DIRETORIA ADMINISTRATIVA
            172547: "THIAGO NEVES",      # GESTÃO DE PESSOAS
            172549: "DANIEL DUARTE",     # DIRETORIA FINANCEIRA
            172550: "THIAGO NEVES",      # SMS
            172576: "ROGERIO SCATAMBULO",  # REGIONAL_ROGERIO
            174405: "DANIEL DUARTE",     # FINANCEIRO
            174406: "ROGERIO SCATAMBULO",  # REGIONAL RJ
            174408: "FERNANDA ARAGÃO",   # DIRETORIA REGIONAL
            175660: "MARCOS CARIAS",      # REGIONAL ES
            175661: "EVERSON GAIDSTIECHI", # REGIONAL PR (maioria)
            175695: "ROGERIO SCATAMBULO",  # REGIONAL CLARO INFRA SUL
            175707: "EVERSON GAIDSTIECHI", # REGIONAL_EVERSON
            191236: "EVERSON GAIDSTIECHI", # REGIONAL CLARO INFRA RS
            191237: "EVERSON GAIDSTIECHI", # REGIONAL CLARO INFRA PR
            191238: "EVERSON GAIDSTIECHI", # REGIONAL CLARO INFRA SC
            194333: "THIAGO NEVES",      # REVAP SP
            197169: "ROGERIO SCATAMBULO",  # REGIONAL DIRETOR MARCOS
            198014: "FELIPE FONTAN",      # SUPRIMENTOS
            198222: "EVERSON GAIDSTIECHI", # CELESC NORTE SC
            204010: "FELIPE FONTAN",      # CUSTOS
            217812: "ROGERIO SCATAMBULO",  # REGIONAL CLARO INFRA NORDESTE
        }
        
        return flow_to_director.get(approval_flow_id, "")
    except Exception:
        return ""


def get_diretor_regional_8(valor, approval_flow_id, api) -> str:
    """Infere o diretor que aprovou a despesa baseado no valor e approval flow.
    
    Lógica:
    - valor < 5000: diretor_regional_8 = diretor_regional (mesmo flow)
    - 5000 <= valor < 10000: diretor_regional_8 = ADILSON RODRIGUES (approver step 3)
    - valor >= 10000: diretor_regional_8 = FERNANDA ARAGÃO (approver step 4)
    """
    try:
        valor_float = _safe_float(valor)
        
        if valor_float < 5000:
            # Para valores baixos, usa o mesmo diretor regional
            # Precisa usar o mapeamento de flow para diretor, não a descrição
            flow_to_director = {
                172530: "ROGERIO SCATAMBULO",
                172531: "ROGERIO SCATAMBULO",
                172532: "EVERSON GAIDSTIECHI",
                172533: "FELIPE FONTAN",
                172534: "EVERSON GAIDSTIECHI",
                172535: "ROGERIO SCATAMBULO",
                172536: "ROGERIO SCATAMBULO",
                172537: "EVERSON GAIDSTIECHI",
                172540: "THIAGO NEVES",
                172547: "THIAGO NEVES",
                172549: "DANIEL DUARTE",
                172550: "THIAGO NEVES",
                172576: "ROGERIO SCATAMBULO",
                174405: "DANIEL DUARTE",
                174406: "ROGERIO SCATAMBULO",
                174408: "FERNANDA ARAGÃO",
                175660: "MARCOS CARIAS",
                175661: "EVERSON GAIDSTIECHI",
                175695: "ROGERIO SCATAMBULO",
                175707: "EVERSON GAIDSTIECHI",
                191236: "EVERSON GAIDSTIECHI",
                191237: "EVERSON GAIDSTIECHI",
                191238: "EVERSON GAIDSTIECHI",
                194333: "THIAGO NEVES",
                197169: "ROGERIO SCATAMBULO",
                198014: "FELIPE FONTAN",
                198222: "EVERSON GAIDSTIECHI",
                204010: "FELIPE FONTAN",
                217812: "ROGERIO SCATAMBULO",
            }
            return flow_to_director.get(approval_flow_id, "")
        elif valor_float < 10000:
            # Para valores médios, ADILSON aprova (step 3)
            return "ADILSON RODRIGUES"
        else:
            # Para valores altos, FERNANDA aprova (step 4)
            return "FERNANDA ARAGÃO"
    except Exception:
        return ""


def get_diretor_regional_by_flow_id(approval_flow_id, api) -> str:
    """Obtém o diretor regional pelo approval_flow_id."""
    try:
        flows = api.get_approval_flows()
        flow = next((f for f in flows if f["id"] == approval_flow_id), None)
        if not flow:
            return ""
        return flow.get("description", "")
    except Exception:
        return ""


class CpfCheck(ColumnCheck):
    """Generic CPF check: verifies CPF exists in team-members API."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        members = api.get_team_members()
        api_cpfs = {m["cpf"] for m in members if m.get("cpf")}
        
        cur = db_conn.execute(f'SELECT * FROM "{table}"')
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]

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

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} CPFs encontrados na API"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} CPFs não encontrados de {result.total} linhas"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class NameCheck(ColumnCheck):
    """Generic name check: compares name column with team-members.name via CPF."""

    def __init__(self, table: str, column: str, display: str, description: str, name_column: str = "colaborador"):
        super().__init__(table, column, display, description)
        self.name_column = name_column

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        name_col = self.name_column
        members = api.get_team_members()
        api_by_cpf = {m["cpf"]: m["name"] for m in members if m.get("cpf")}
        
        cur = db_conn.execute(f'SELECT * FROM "{table}"')
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]

        result = CheckResult(status="green", note="", total=len(rows))
        for row in rows:
            cpf = _normalize(row.get("cpf"))
            db_val = _normalize(row.get(name_col))
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

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} nomes batem com team-members.name"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: team-members.name"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class SituacaoCheck(ColumnCheck):
    """Generic situation check: compares situação column with team-members.active."""

    _MAP = {True: "ATIVO", False: "INATIVO"}

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        members = api.get_team_members()
        api_by_cpf = {m["cpf"]: self._MAP.get(m.get("active"), "DESCONHECIDO")
                      for m in members if m.get("cpf")}
        
        cur = db_conn.execute(f'SELECT * FROM "{table}"')
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]

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

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} situações batem com team-members.active"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: team-members.active"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class ExpenseIdCheck(ColumnCheck):
    """Check if expense ID exists in expenses API (uses lazy loading by ID)."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        expense_ids = [row[0] for row in cur.fetchall()]
        
        # Convert to int for API comparison (handle floats from SQLite)
        expense_ids_int = []
        for eid in expense_ids:
            if eid:
                try:
                    expense_ids_int.append(int(float(eid)))
                except (ValueError, TypeError):
                    pass
        
        if not expense_ids_int:
            return CheckResult(status="yellow", note="Nenhum ID de despesa encontrado", total=0)
        
        print(f"[{self.display}] Verificando {len(expense_ids_int)} IDs via lazy loading...")
        
        result = CheckResult(status="green", note="", total=len(expense_ids))
        for i, eid in enumerate(expense_ids):
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            
            # Use lazy loading to fetch expense by ID
            expense = api.get_expense_by_id(eid_int)
            if expense:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=str(eid), api_value="não encontrado"))
            
            # Progress update every 100 IDs
            if (i + 1) % 100 == 0:
                print(f"[{self.display}] Progresso: {i+1}/{len(expense_ids)} ({(i+1)/len(expense_ids)*100:.1f}%)")

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} IDs de despesa encontrados na API"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} IDs não encontrados de {result.total} linhas. API: expenses.id"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result


class ReportIdCheck(ColumnCheck):
    """Check if report ID exists in reports API."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        cur = db_conn.execute(f'SELECT id_do_relatório FROM "{table}" WHERE id_do_relatório IS NOT NULL')
        report_ids = [row[0] for row in cur.fetchall()]
        
        # Convert to int for API comparison (handle floats from SQLite)
        report_ids_int = []
        for rid in report_ids:
            if rid:
                try:
                    report_ids_int.append(int(float(rid)))
                except (ValueError, TypeError):
                    pass
        
        if not report_ids_int:
            return CheckResult(status="yellow", note="Nenhum ID de relatório encontrado", total=0)
        
        api_reports = api.get_reports_by_ids(report_ids_int)
        
        result = CheckResult(status="green", note="", total=len(report_ids))
        for rid in report_ids:
            try:
                rid_int = int(float(rid)) if rid else None
            except (ValueError, TypeError):
                rid_int = None
            if not rid_int:
                result.not_found += 1
                continue
            if rid_int in api_reports:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(rid), db_value=str(rid), api_value="não encontrado"))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} IDs de relatório encontrados na API"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} IDs não encontrados de {result.total} linhas. API: reports.id"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class ExpenseStatusCheck(ColumnCheck):
    """Check expense status against API."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, status FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de status encontrado", total=0)
        
        # Get expenses by period (agosto 2025) - carrega uma única vez
        print(f"[{self.display}] Carregando expenses por período...")
        load_start = time.time()
        api_expenses = api.get_or_load_period_expenses("2025-08-01", "2025-08-31")
        load_time = time.time() - load_start
        print(f"[{self.display}] Expenses carregados: {len(api_expenses)} em {load_time:.2f}s")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_status in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            if eid_int not in api_expenses:
                result.not_found += 1
                continue
            
            # API status mapping - normalize comparison
            # Status está no report.status, não no expense.status
            api_expense = api_expenses[eid_int]
            report_data = api_expense.get("report", {})
            api_status = _normalize(report_data.get("status", "")) if report_data else ""
            db_status_norm = _normalize(db_status)
            
            if db_status_norm == api_status:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=db_status_norm, api_value=api_status))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} status batem com expenses.status"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.status"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result


class ExpenseAmountCheck(ColumnCheck):
    """Check expense amount against API."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, valor FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de valor encontrado", total=0)
        
        # Get expenses by period (agosto 2025) - carrega uma única vez
        print(f"[{self.display}] Carregando expenses por período...")
        load_start = time.time()
        api_expenses = api.get_or_load_period_expenses("2025-08-01", "2025-08-31")
        load_time = time.time() - load_start
        print(f"[{self.display}] Expenses carregados: {len(api_expenses)} em {load_time:.2f}s")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_val in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            if eid_int not in api_expenses:
                result.not_found += 1
                continue
            
            # Normalize values for comparison
            api_expense = api_expenses[eid_int]
            api_amount = _safe_float(api_expense.get("value", 0))
            
            # Parse DB value (handle Brazilian format and float strings)
            db_amount = _safe_float(db_val)
            
            # Compare with small tolerance for floating point
            if abs(db_amount - api_amount) < 0.01:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=str(db_amount), api_value=str(api_amount)))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} valores batem com expenses.value"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.value"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result


class CurrencyCheck(ColumnCheck):
    """Check currency field (moeda_do_relatório) against expenses.original_currency_iso."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, moeda_do_relatório FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de moeda encontrado", total=0)
        
        # Get expenses by period (agosto 2025) - carrega uma única vez
        api_expenses = api.get_or_load_period_expenses("2025-08-01", "2025-08-31")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_currency in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            if eid_int not in api_expenses:
                result.not_found += 1
                continue
            
            # Normalize currency comparison
            api_expense = api_expenses[eid_int]
            api_currency = api_expense.get("original_currency_iso", "BRL")
            db_currency_norm = _normalize(db_currency) if db_currency else ""
            api_currency_norm = _normalize(api_currency)
            
            # Default to BRL if empty
            if not db_currency_norm:
                db_currency_norm = "BRL"
            if not api_currency_norm:
                api_currency_norm = "BRL"
            
            if db_currency_norm == api_currency_norm:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=db_currency_norm, api_value=api_currency_norm))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} moedas batem com expenses.original_currency_iso"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.original_currency_iso"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class BankInfoCheck(ColumnCheck):
    """Check bank fields (banco, agência, conta, pix) against user data."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        members = api.get_team_members()
        api_users = {m["cpf"]: m for m in members if m.get("cpf")}
        
        cur = db_conn.execute(f'SELECT cpf, {self.column} FROM "{table}"')
        rows = cur.fetchall()
        
        result = CheckResult(status="green", note="", total=len(rows))
        for cpf, db_value in rows:
            cpf_norm = _normalize(cpf)
            if not cpf_norm or cpf_norm not in api_users:
                result.not_found += 1
                continue
            
            api_user = api_users[cpf_norm]
            api_value = api_user.get(self.column) or ""
            db_value_norm = _normalize(db_value) if db_value else ""
            api_value_norm = _normalize(api_value)
            
            if db_value_norm == api_value_norm:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=cpf_norm, db_value=db_value_norm, api_value=api_value_norm))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} {self.column} batem com user.{self.column}"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: user.{self.column}"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class DateCheck(ColumnCheck):
    """Check date fields (data, data_de_pagamento) against expenses."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, {self.column} FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note=f"Nenhum dado de {self.column} encontrado", total=0)
        
        # Get expenses by period (agosto 2025) - carrega uma única vez
        api_expenses = api.get_or_load_period_expenses("2025-08-01", "2025-08-31")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_date in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            if eid_int not in api_expenses:
                result.not_found += 1
                continue
            
            # Normalize date comparison
            api_expense = api_expenses[eid_int]
            # Campo no banco é "data" mas na API é "date"
            api_field = "date" if self.column == "data" else "payment_date"
            api_date = api_expense.get(api_field, "")
            db_date_norm = _normalize_date(db_date) if db_date else ""
            api_date_norm = _normalize_date(api_date)
            
            if db_date_norm == api_date_norm:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=db_date_norm, api_value=api_date_norm))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} {self.column} batem com expenses.{self.column}"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.{self.column}"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class DescriptionCheck(ColumnCheck):
    """Check description fields (descrição_da_despesa, anotação_da_despesa) against expenses."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, {self.column} FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note=f"Nenhum dado de {self.column} encontrado", total=0)
        
        # Get expenses by period (agosto 2025) - carrega uma única vez
        api_expenses = api.get_or_load_period_expenses("2025-08-01", "2025-08-31")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_desc in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            if eid_int not in api_expenses:
                result.not_found += 1
                continue
            
            # Map column name to API field
            api_field = "title" if self.column == "descrição_da_despesa" else "observation"
            api_expense = api_expenses[eid_int]
            api_desc = api_expense.get(api_field, "")
            db_desc_norm = _normalize(db_desc) if db_desc else ""
            api_desc_norm = _normalize(api_desc)
            
            if db_desc_norm == api_desc_norm:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=db_desc_norm, api_value=api_desc_norm))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} {self.column} batem com expenses.{api_field}"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.{api_field}"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class ExpenseTypeCheck(ColumnCheck):
    """Check expense type (tipo_de_despesa) against expense_type.description."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, tipo_de_despesa FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de tipo de despesa encontrado", total=0)
        
        # Get expenses by period (agosto 2025) - carrega uma única vez
        api_expenses = api.get_or_load_period_expenses("2025-08-01", "2025-08-31")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_type in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            if eid_int not in api_expenses:
                result.not_found += 1
                continue
            
            # Get expense type from nested data
            api_expense = api_expenses[eid_int]
            expense_type_data = api_expense.get("expense_type", {})
            api_type = expense_type_data.get("description", "") if expense_type_data else ""
            db_type_norm = _normalize(db_type) if db_type else ""
            api_type_norm = _normalize(api_type)
            
            if db_type_norm == api_type_norm:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=db_type_norm, api_value=api_type_norm))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} tipos batem com expense_type.description"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expense_type.description"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class ReimbursableCheck(ColumnCheck):
    """Check reimbursable field (reembolsável) against expenses.reimbursable."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, reembolsável FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de reembolsável encontrado", total=0)
        
        # Get expenses by period (agosto 2025) - carrega uma única vez
        api_expenses = api.get_or_load_period_expenses("2025-08-01", "2025-08-31")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_reimb in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            if eid_int not in api_expenses:
                result.not_found += 1
                continue
            
            # Normalize reimbursable comparison
            api_expense = api_expenses[eid_int]
            api_reimb = api_expense.get("reimbursable", False)
            db_reimb_norm = _normalize(db_reimb) if db_reimb else ""
            
            # Convert to boolean comparison
            db_bool = db_reimb_norm in ["SIM", "TRUE", "1", "S"]
            api_bool = bool(api_reimb)
            
            if db_bool == api_bool:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=str(db_bool), api_value=str(api_bool)))

        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} reembolsável batem com expenses.reimbursable"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.reimbursable"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result
