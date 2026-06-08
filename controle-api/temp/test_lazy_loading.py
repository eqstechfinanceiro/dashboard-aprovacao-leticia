"""
Test script for lazy loading with a small sample of IDs.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
from src.checks.controle_base_prestacoes import ALL_CHECKS, TABLE
from src.checks.shared import ExpenseIdCheck

class MockAPI:
    """Mock API that loads data from local JSON files or fetches on-demand from API."""
    
    def __init__(self):
        self._expenses = None
        self._team_members = None
        self._reports = None
        self._expense_map = {}
        self._api_key = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
        self._base_url = "https://api.vexpenses.com"
        self._use_lazy_loading = True
    
    def get_or_load_period_expenses(self, start_date, end_date, includes="user,costs_center,payment_method,expense_type,report,apportionment,project"):
        """Load expenses from local JSON file."""
        if self._expenses is None:
            import json
            try:
                with open('data/expenses.json', 'r', encoding='utf-8-sig') as f:
                    data = json.load(f)
                    self._expenses = data.get('data', [])
                    for exp in self._expenses:
                        self._expense_map[str(exp['id'])] = exp
                print(f"Carregados {len(self._expenses)} expenses do arquivo data/expenses.json")
            except FileNotFoundError:
                print("AVISO: Arquivo data/expenses.json não encontrado. Usando lazy loading da API.")
                self._expenses = []
                self._expense_map = {}
        return self._expenses
    
    def get_team_members(self):
        """Load team members from local JSON file."""
        if self._team_members is None:
            import json
            try:
                with open('data/team_members.json', 'r', encoding='utf-8-sig') as f:
                    data = json.load(f)
                    self._team_members = data.get('data', [])
                print(f"Carregados {len(self._team_members)} team members do arquivo data/team_members.json")
            except FileNotFoundError:
                print("AVISO: Arquivo data/team_members.json não encontrado.")
                self._team_members = []
        return self._team_members
    
    def get_approval_flows(self):
        """Load approval flows from local JSON file."""
        import json
        try:
            with open('data/approval_flows.json', 'r', encoding='utf-8-sig') as f:
                data = json.load(f)
                return data.get('data', [])
        except FileNotFoundError:
            return []
    
    def get_expense_by_id(self, expense_id):
        """Get expense by ID from the loaded data or fetch on-demand from API."""
        expense_id_str = str(expense_id)
        
        if expense_id_str in self._expense_map:
            return self._expense_map[expense_id_str]
        
        if self._use_lazy_loading:
            import subprocess
            import json
            import time
            
            url = f"{self._base_url}/v2/expenses/{expense_id}?include=user,costs_center,payment_method,expense_type,report,apportionment"
            
            response = subprocess.run(
                ["curl.exe", "-s", "-H", f"Authorization: {self._api_key}", "-H", "Accept: application/json", url],
                capture_output=True,
                text=True
            )
            
            if response.returncode == 0:
                try:
                    data = json.loads(response.stdout)
                    if data.get('success') and 'data' in data and data['data']:
                        expense = data['data']
                        
                        if expense.get('user') and expense['user'].get('data'):
                            expense['user'] = expense['user']['data']
                        if expense.get('costs_center') and expense['costs_center'].get('data'):
                            expense['costs_center'] = expense['costs_center']['data']
                        if expense.get('payment_method') and expense['payment_method'].get('data'):
                            expense['payment_method'] = expense['payment_method']['data']
                        if expense.get('expense_type') and expense['expense_type'].get('data'):
                            expense['expense_type'] = expense['expense_type']['data']
                        if expense.get('report') and expense['report'].get('data'):
                            expense['report'] = expense['report']['data']
                        
                        self._expense_map[expense_id_str] = expense
                        self._expenses.append(expense)
                        
                        time.sleep(0.2)
                        
                        return expense
                except json.JSONDecodeError:
                    pass
        
        return None
    
    def get_reports_by_ids(self, report_ids):
        """Get reports by IDs - returns empty list for now."""
        return []

def main():
    print(f"Testando lazy loading com amostra de 50 IDs")
    print("=" * 80)
    
    conn = sqlite3.connect('data/spreadsheets.db')
    
    # Get sample of 50 IDs
    cur = conn.execute('SELECT id_da_despesa FROM controle_base_prestacoes WHERE id_da_despesa IS NOT NULL LIMIT 50')
    sample_ids = [row[0] for row in cur.fetchall()]
    
    print(f"Amostra de {len(sample_ids)} IDs")
    
    # Create a temporary table with just the sample
    cur.execute('CREATE TEMP TABLE controle_base_prestacoes_sample AS SELECT * FROM controle_base_prestacoes WHERE id_da_despesa IN ({})'.format(','.join(map(str, sample_ids))))
    
    # Create a custom check for the sample table
    class SampleExpenseIdCheck(ExpenseIdCheck):
        def __init__(self):
            super().__init__("controle_base_prestacoes_sample", "id_da_despesa", "ID DA DESPESA (AMOSTRA)", "Verifica se ID existe na API")
    
    api = MockAPI()
    api.get_or_load_period_expenses("2025-01-01", "2025-12-31")
    
    check = SampleExpenseIdCheck()
    result = check.run(conn, api)
    
    print(f"\n{check.display}")
    print("-" * 60)
    print(f"Status: {result.status}")
    print(f"Total: {result.total}")
    print(f"Matched: {result.matched}")
    print(f"Mismatched: {result.mismatched}")
    print(f"Not found: {result.not_found}")
    print(f"Nota: {result.note}")
    
    if result.mismatches:
        print("Exemplos de divergências:")
        for mismatch in result.mismatches[:5]:
            print(f"  {mismatch.key}: DB={mismatch.db_value}, API={mismatch.api_value}")
    
    print(f"\nExpenses baixados via lazy loading: {len(api._expenses)}")
    print("=" * 80)
    print("Teste concluído!")
    
    conn.close()

if __name__ == "__main__":
    main()
