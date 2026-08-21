"""
Registro central de todos os checks de coluna.

Para adicionar checks de uma nova tabela:
  1. Crie src/checks/nome_da_tabela.py com ALL_CHECKS
  2. Importe e adicione ALL_CHECKS aqui em REGISTRY
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.checks.carga_1qz import ALL_CHECKS as _CARGA_1QZ
from src.checks.controle_painel import ALL_CHECKS as _CONTROLE_PAINEL
from src.checks.controle_saldo_cartao import ALL_CHECKS as _CONTROLE_SALDO_CARTAO
from src.checks.controle_saldo_cartao_resumo import ALL_CHECKS as _CONTROLE_SALDO_CARTAO_RESUMO
from src.checks.controle_adicional_itau import ALL_CHECKS as _CONTROLE_ADICIONAL_ITAU
from src.checks.controle_adicionais import ALL_CHECKS as _CONTROLE_ADICIONAIS
from src.checks.controle_quinzenas import ALL_CHECKS as _CONTROLE_QUINZENAS
from src.checks.controle_saldos_adm import ALL_CHECKS as _CONTROLE_SALDOS_ADM
from src.checks.controle_extrato import ALL_CHECKS as _CONTROLE_EXTRATO
from src.checks.controle_base_prestacoes import ALL_CHECKS as _CONTROLE_BASE_PRESTACOES
from src.checks.controle_reembolso import ALL_CHECKS as _CONTROLE_REEMBOLSO
from src.checks.controle_estorno_saque import ALL_CHECKS as _CONTROLE_ESTORNO_SAQUE
from src.checks.controle_detalhes1 import ALL_CHECKS as _CONTROLE_DETALHES1
from src.checks.controle_detalhes2 import ALL_CHECKS as _CONTROLE_DETALHES2
from src.checks.controle_detalhes3 import ALL_CHECKS as _CONTROLE_DETALHES3

# Registro global: table_name -> list[ColumnCheck]
REGISTRY: dict = {}

for check in _CARGA_1QZ:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_PAINEL:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_SALDO_CARTAO:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_SALDO_CARTAO_RESUMO:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_ADICIONAL_ITAU:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_ADICIONAIS:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_QUINZENAS:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_SALDOS_ADM:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_EXTRATO:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_BASE_PRESTACOES:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_REEMBOLSO:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_ESTORNO_SAQUE:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_DETALHES1:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_DETALHES2:
    REGISTRY.setdefault(check.table, []).append(check)
for check in _CONTROLE_DETALHES3:
    REGISTRY.setdefault(check.table, []).append(check)


def get_checks_for_table(table_name: str) -> list:
    """Retorna todos os checks registrados para uma tabela."""
    return REGISTRY.get(table_name, [])


def list_tables_with_checks() -> list[str]:
    """Retorna todos os table_names que têm checks registrados."""
    return list(REGISTRY.keys())
