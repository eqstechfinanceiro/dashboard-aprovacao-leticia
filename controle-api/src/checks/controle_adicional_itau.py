"""
Checks de coluna para a tabela controle_adicional_itau.
Fonte: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb → ADICIONAL ITAÚ

Chave de junção com a API: CPF (coluna 'cpf' no SQLite)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, yellow
from src.checks.shared import CpfCheck, NameCheck

TABLE = "controle_adicional_itau"

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
]
