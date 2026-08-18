"""
Checks de coluna para a tabela controle_saldo_cartao_resumo.
Fonte: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb → SALDO CARTAO (Tabela 2)

Chave de junção com a API: CPF (coluna 'cpf' no SQLite)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, yellow
from src.checks.shared import CpfCheck, NameCheck

TABLE = "controle_saldo_cartao_resumo"

ALL_CHECKS: list[ColumnCheck] = [
    CpfCheck(
        table=TABLE, column="cpf", display="CPF",
        description="CPF do portador — chave de junção com team-members"
    ),
    NameCheck(
        table=TABLE, column="portador", display="PORTADOR",
        description="Nome do portador — via team-members.name (join por CPF)",
        name_column="portador"
    ),
]
