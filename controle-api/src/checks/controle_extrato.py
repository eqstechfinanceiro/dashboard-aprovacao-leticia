"""
Checks de coluna para a tabela controle_extrato.
Fonte: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb → EXTRATO

Chave de junção com a API: CPF (coluna 'cpf' no SQLite)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, yellow
from src.checks.shared import CpfCheck

TABLE = "controle_extrato"

ALL_CHECKS: list[ColumnCheck] = [
    CpfCheck(
        table=TABLE, column="cpf", display="CPF",
        description="CPF do colaborador — chave de junção com team-members"
    ),
]
