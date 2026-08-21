"""
Checks de coluna para a tabela controle_saldos_adm.
Fonte: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb → SALDOS ADM EQS

Chave de junção com a API: CPF (coluna 'cpf' no SQLite)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, yellow
from src.checks.shared import CpfCheck, NameCheck, SituacaoCheck

TABLE = "controle_saldos_adm"

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
    SituacaoCheck(
        table=TABLE, column="situação", display="SITUAÇÃO",
        description="Status ativo/inativo — via team-members.active"
    ),
]
