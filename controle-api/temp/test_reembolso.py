"""Testa todos os checks da tabela controle_reembolso usando dados carregados de arquivos JSON."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sqlite3
from src.api_client import load_team_members_from_file, load_approval_flows_from_file
from src.checks.controle_reembolso import ALL_CHECKS, TABLE


class MockAPI:
    """Mock API que carrega dados de arquivos JSON."""
    
    def __init__(self):
        self.team_members = load_team_members_from_file()
        self.approval_flows = load_approval_flows_from_file()
    
    def get_team_members(self):
        return self.team_members
    
    def get_approval_flows(self):
        return self.approval_flows


def main():
    print(f"Testando checks para tabela: {TABLE}")
    print("=" * 60)
    
    # Conectar ao banco
    db_path = "data/spreadsheets.db"
    if not os.path.exists(db_path):
        print(f"Erro: Banco de dados não encontrado em {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    
    # Criar mock API
    api = MockAPI()
    
    print(f"Team members carregados: {len(api.team_members)}")
    print(f"Approval flows carregados: {len(api.approval_flows)}")
    print()
    
    # Executar todos os checks
    for check in ALL_CHECKS:
        print(f"\n{check.display}")
        print("-" * 60)
        result = check.run(conn, api)
        print(f"Status: {result.status}")
        print(f"Total: {result.total}")
        print(f"Matched: {result.matched}")
        print(f"Mismatched: {result.mismatched}")
        print(f"Not found: {result.not_found}")
        print(f"Nota: {result.note}")
        
        if result.mismatches:
            print("\nExemplos de divergências:")
            for m in result.mismatches:
                print(f"  {m.key}: DB={m.db_value}, API={m.api_value}")
    
    conn.close()
    print("\n" + "=" * 60)
    print("Teste concluído!")


if __name__ == "__main__":
    main()
