"""
Executa os checks de coluna e retorna resultados consolidados.
"""
import sqlite3
import traceback
from typing import Optional
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src import api_client
from src.checks import get_checks_for_table, list_tables_with_checks
from src.checks.base import CheckResult

# Cache de resultados em memória (table -> list of result dicts)
_results_cache: dict[str, list[dict]] = {}


def run_table(table_name: str, db_path: str) -> list[dict]:
    """
    Executa todos os checks de uma tabela.
    Retorna lista de resultados por coluna.
    """
    checks = get_checks_for_table(table_name)
    if not checks:
        return []

    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row

    results = []
    for check in checks:
        try:
            result: CheckResult = check.run(conn, api_client)
            results.append({
                "column": check.column,
                "display": check.display,
                "description": check.description,
                **result.to_dict(),
            })
        except Exception as e:
            results.append({
                "column": check.column,
                "display": check.display,
                "description": check.description,
                "status": "error",
                "note": f"Erro ao executar check: {e}",
                "stats": {"total": 0, "matched": 0, "mismatched": 0, "not_found": 0},
                "mismatches": [],
                "traceback": traceback.format_exc(),
            })

    conn.close()
    _results_cache[table_name] = results
    return results


def get_cached(table_name: str) -> Optional[list[dict]]:
    return _results_cache.get(table_name)


def tables_with_checks() -> list[str]:
    return list_tables_with_checks()
