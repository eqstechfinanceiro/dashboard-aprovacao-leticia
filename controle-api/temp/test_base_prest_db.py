"""
Test script for controle_base_prestacoes checks using SQLite database.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
from src.checks.controle_base_prestacoes import ALL_CHECKS, TABLE
from src.checks.shared_db import (
    ExpenseIdDBCheck, StatusDBCheck, ExpenseAmountDBCheck,
    ExpenseTypeDBCheck, PaymentMethodDBCheck, CurrencyDBCheck
)

def main():
    print(f"Testando checks para tabela: {TABLE} (usando banco SQLite)")
    print("=" * 80)
    
    # Connect to database
    conn = sqlite3.connect('data/spreadsheets.db')
    
    # Check if expenses table exists
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'")
    if not cursor.fetchone():
        print("ERRO: Tabela 'expenses' não encontrada no banco!")
        print("Execute 'python download_to_db.py' primeiro para criar a tabela e baixar os dados.")
        conn.close()
        return
    
    # Get count of expenses in database
    cursor.execute('SELECT COUNT(*) FROM expenses')
    expenses_count = cursor.fetchone()[0]
    print(f"Expenses no banco: {expenses_count:,}")
    
    # Create custom checks using database
    db_checks = [
        ExpenseIdDBCheck(TABLE, "id_da_despesa", "ID DA DESPESA", "Verifica se ID existe na API"),
        StatusDBCheck(TABLE, "status", "STATUS", "Verifica status do expense"),
        ExpenseAmountDBCheck(TABLE, "valor", "VALOR", "Verifica valor do expense"),
        ExpenseTypeDBCheck(TABLE, "tipo_de_despesa", "TIPO DE DESPESA", "Verifica tipo de despesa"),
        PaymentMethodDBCheck(TABLE, "forma_de_pagamento", "FORMA DE PAGAMENTO", "Verifica forma de pagamento"),
        CurrencyDBCheck(TABLE, "moeda_do_relatório", "MOEDA", "Verifica moeda do expense"),
    ]
    
    print()
    
    # Run database checks
    for check in db_checks:
        result = check.run(conn, None)  # No API needed when using DB
        
        print(f"{check.display}")
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
        
        print()
    
    print("=" * 80)
    print("Teste concluído!")
    
    conn.close()

if __name__ == "__main__":
    main()
