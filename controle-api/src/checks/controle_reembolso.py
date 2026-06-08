"""
Checks de coluna para a tabela controle_reembolso.
Fonte: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb → REEMBOLSO

Chave de junção com a API: CPF (coluna 'cpf' no SQLite)
"""
import sys
import os
import sqlite3
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, CheckResult, Mismatch, yellow
from src.checks.shared import CpfCheck, NameCheck, _normalize, _safe_float, get_diretor_regional, get_diretor_regional_8

TABLE = "controle_reembolso"


class DiretorRegionalCheck(ColumnCheck):
    """Verifica diretor_regional via centro de custo (mais preciso que approval flow)."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        result = CheckResult(status="yellow", note="Inicializando")
        
        cur = db_conn.execute(f'SELECT colaborador, cpf, diretor_regional, centro_de_custo FROM "{table}"')
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        
        for row in rows:
            row_dict = dict(zip(cols, row))
            cpf = row_dict.get("cpf")
            cc = row_dict.get("centro_de_custo")
            db_diretor = _normalize(row_dict.get(self.column))
            
            if not cpf:
                result.not_found += 1
                continue
            
            # Buscar user por CPF
            members = api.get_team_members()
            user = next((m for m in members if m.get("cpf") == cpf), None)
            
            if not user:
                result.not_found += 1
                continue
            
            # Obter diretor regional via centro de custo
            api_diretor = _normalize(get_diretor_regional(user["id"], api, cc))
            
            if db_diretor == api_diretor:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(
                        key=row_dict.get("colaborador"),
                        db_value=str(db_diretor),
                        api_value=str(api_diretor)
                    ))
        
        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} diretores regionais batem com centro de custo"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: centro de custo"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


class DiretorRegional8Check(ColumnCheck):
    """Verifica diretor_regional_8 inferido via valor da despesa."""

    def run(self, db_conn, api) -> CheckResult:
        table = self.table
        result = CheckResult(status="yellow", note="Inicializando")
        
        cur = db_conn.execute(f'SELECT colaborador, cpf, valor, diretor_regional_8 FROM "{table}"')
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        
        for row in rows:
            row_dict = dict(zip(cols, row))
            cpf = row_dict.get("cpf")
            valor = row_dict.get("valor")
            db_diretor = _normalize(row_dict.get(self.column))
            
            if not cpf:
                result.not_found += 1
                continue
            
            # Buscar user por CPF
            members = api.get_team_members()
            user = next((m for m in members if m.get("cpf") == cpf), None)
            
            if not user:
                result.not_found += 1
                continue
            
            # Obter diretor regional_8 inferido
            approval_flow_id = user.get("approval_flow_id")
            api_diretor = _normalize(get_diretor_regional_8(valor, approval_flow_id, api))
            
            # Se DB está vazio e valor é baixo, considera como match
            if not db_diretor and _safe_float(valor) < 5000:
                result.matched += 1
                continue
            
            if db_diretor == api_diretor:
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(
                        key=row_dict.get("colaborador"),
                        db_value=str(db_diretor),
                        api_value=str(api_diretor)
                    ))
        
        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} diretores regionais_8 batem com inferência por valor"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: inferência por valor"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        return result


ALL_CHECKS: list[ColumnCheck] = [
    CpfCheck(
        table=TABLE, column="cpf", display="CPF",
        description="CPF do colaborador — chave de junção com team-members"
    ),
    NameCheck(
        table=TABLE, column="colaborador", display="COLABORADOR",
        description="Nome do colaborador — via team-members.name (join por CPF)",
        name_column="colaborador"
    ),
    DiretorRegionalCheck(
        table=TABLE, column="diretor_regional", display="DIRETOR REGIONAL",
        description="Diretor regional — via approval_flow.description (inferido)"
    ),
    DiretorRegional8Check(
        table=TABLE, column="diretor_regional_8", display="DIRETOR REGIONAL 8",
        description="Diretor regional 8 — inferido por valor da despesa"
    ),
]
