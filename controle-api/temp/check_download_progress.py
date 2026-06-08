"""
Script para verificar o progresso do download em background
"""
import sqlite3
import os
from datetime import datetime

def check_progress():
    print("=" * 60)
    print("PROGRESSO DO DOWNLOAD")
    print("=" * 60)
    
    # Verificar se o log existe
    log_file = "download_log.txt"
    if os.path.exists(log_file):
        print(f"\nÚltimas linhas do log ({log_file}):")
        print("-" * 40)
        with open(log_file, 'r') as f:
            lines = f.readlines()
            for line in lines[-10:]:
                print(line.rstrip())
    
    # Verificar banco de dados
    conn = sqlite3.connect('data/spreadsheets.db')
    cursor = conn.cursor()
    
    # Verificar se a tabela expenses existe
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'")
    table_exists = cursor.fetchone()
    
    if not table_exists:
        print(f"\nESTATÍSTICAS DO BANCO:")
        print(f"  Tabela 'expenses' ainda não foi criada")
        print(f"  Execute 'python download_to_db.py' primeiro")
        conn.close()
        return
    
    # Contar expenses no banco
    cursor.execute('SELECT COUNT(*) FROM expenses')
    expenses_count = cursor.fetchone()[0]
    
    # Contar IDs na planilha
    cursor.execute('SELECT COUNT(*) FROM controle_base_prestacoes WHERE id_da_despesa IS NOT NULL')
    spreadsheet_count = cursor.fetchone()[0]
    
    # IDs únicos na planilha
    cursor.execute('SELECT COUNT(DISTINCT id_da_despesa) FROM controle_base_prestacoes WHERE id_da_despesa IS NOT NULL')
    unique_count = cursor.fetchone()[0]
    
    # Último download
    cursor.execute('SELECT MAX(downloaded_at) FROM expenses')
    last_download = cursor.fetchone()[0]
    
    # Primeiro e último ID no banco
    cursor.execute('SELECT MIN(id), MAX(id) FROM expenses')
    min_id, max_id = cursor.fetchone()
    
    conn.close()
    
    print(f"\nESTATÍSTICAS DO BANCO:")
    print(f"  Expenses no banco: {expenses_count:,}")
    print(f"  IDs na planilha: {spreadsheet_count:,}")
    print(f"  IDs únicos na planilha: {unique_count:,}")
    print(f"  Progresso: {expenses_count/unique_count*100:.1f}%")
    
    if min_id and max_id:
        print(f"  Range de IDs: {min_id:,} a {max_id:,}")
    
    if last_download:
        print(f"  Último download: {last_download}")
    
    # Verificar se o processo está rodando
    try:
        result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq python.exe'], 
                              capture_output=True, text=True)
        if 'python.exe' in result.stdout:
            print(f"\n✓ Processo Python está rodando")
        else:
            print(f"\n✗ Nenhum processo Python encontrado")
    except:
        print(f"\n? Não foi possível verificar processos")
    
    print("=" * 60)

if __name__ == "__main__":
    import subprocess
    check_progress()
