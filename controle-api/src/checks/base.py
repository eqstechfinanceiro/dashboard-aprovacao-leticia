"""
Estrutura base para checks de coluna.

Cada check define como verificar UMA coluna de UMA tabela contra a API.
Status possíveis:
  green  → API retornou o dado e bate com a planilha
  red    → API retornou mas diverge da planilha
  yellow → dado não disponível na API, precisa de outra fonte
  error  → falha inesperada ao chamar a API
"""
from dataclasses import dataclass, field
from typing import Literal

Status = Literal["green", "red", "yellow", "error"]


@dataclass
class Mismatch:
    """Exemplo de linha com divergência."""
    key: str        # identificador da linha (ex: CPF)
    db_value: str   # valor na planilha/SQLite
    api_value: str  # valor retornado pela API


@dataclass
class CheckResult:
    status: Status
    note: str
    total: int = 0
    matched: int = 0
    mismatched: int = 0
    not_found: int = 0          # linhas do DB sem correspondência na API
    mismatches: list = field(default_factory=list)  # até 5 exemplos

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "note": self.note,
            "stats": {
                "total": self.total,
                "matched": self.matched,
                "mismatched": self.mismatched,
                "not_found": self.not_found,
            },
            "mismatches": [
                {"key": m.key, "db_value": m.db_value, "api_value": m.api_value}
                for m in self.mismatches[:5]
            ],
        }


@dataclass
class ColumnCheck:
    """Define como verificar uma coluna via API."""
    table: str          # nome da tabela SQLite
    column: str         # nome da coluna (sanitizado, como está no SQLite)
    display: str        # nome original da coluna (para exibição)
    description: str    # o que esse dado representa / de onde vem na API

    def run(self, db_conn, api_client_module) -> CheckResult:
        """Executa o check. Sobrescrever em subclasses ou usar fn."""
        raise NotImplementedError


def yellow(table: str, column: str, display: str, description: str, note: str) -> "ColumnCheck":
    """Atalho para criar um check que sempre retorna yellow (dado não disponível)."""

    class _YellowCheck(ColumnCheck):
        def run(self, db_conn, api_client_module) -> CheckResult:
            return CheckResult(
                status="yellow",
                note=note,
            )

    return _YellowCheck(
        table=table,
        column=column,
        display=display,
        description=description,
    )
