#!/usr/bin/env python3
"""
Download histórico de extrato via API (de 15 em 15 dias)
Salvar no SQLite para cálculo de saldo acumulado
"""

import subprocess
import pandas as pd
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
import time

# Configuração
LARAVEL_TOKEN = "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0="
DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
TEMP_DIR = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/temp")

# Criar diretório temp se não existir
TEMP_DIR.mkdir(exist_ok=True)

def dividir_periodo(start_date, end_date, max_dias=15):
    """Dividir período em chunks de max_dias"""
    chunks = []
    current = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    while current <= end:
        chunk_end = min(current + timedelta(days=max_dias-1), end)
        chunks.append((
            current.strftime("%Y-%m-%d"),
            chunk_end.strftime("%Y-%m-%d")
        ))
        current = chunk_end + timedelta(days=1)
    
    return chunks

def download_extrato(start_date, end_date):
    """Download de extrato via API para um período"""
    url = f"https://api.vexpenses.com/v3/pay/statement/excel-all?start_date={start_date}&end_date={end_date}"
    
    cmd = [
        "curl.exe", "-s", "-X", "GET", url,
        "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}",
        "-H", "Accept: application/json"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            return None, f"Curl error: {result.stderr}"
        
        data = json.loads(result.stdout)
        
        if not data.get('success'):
            erro = data.get('errors', [{}])[0].get('message', 'Erro desconhecido')
            return None, f"API error: {erro}"
        
        download_url = data.get('data', {}).get('url')
        if not download_url:
            return None, "No download URL"
        
        # Download do arquivo XLSX
        temp_file = TEMP_DIR / f"extrato_{start_date}_{end_date}.xlsx"
        
        dl_cmd = ["curl.exe", "-s", "-L", "-o", str(temp_file), download_url]
        dl_result = subprocess.run(dl_cmd, capture_output=True, timeout=120)
        
        if dl_result.returncode != 0 or not temp_file.exists():
            return None, "Download failed"
        
        # Ler o XLSX
        df = pd.read_excel(temp_file)
        
        # Limpar arquivo temp
        temp_file.unlink()
        
        return df, None
        
    except subprocess.TimeoutExpired:
        return None, "Timeout"
    except Exception as e:
        return None, str(e)

def init_database():
    """Inicializar banco SQLite"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS extrato (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data TEXT,
            tipo TEXT,
            usuario TEXT,
            valor REAL,
            descricao TEXT,
            periodo_start TEXT,
            periodo_end TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_extrato_usuario ON extrato(usuario)
    ''')
    
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_extrato_data ON extrato(data)
    ''')
    
    conn.commit()
    conn.close()
    print(f"✓ Banco inicializado: {DB_FILE}")

def salvar_no_banco(df, start_date, end_date):
    """Salvar DataFrame no SQLite"""
    conn = sqlite3.connect(DB_FILE)
    
    # Preparar dados
    df['periodo_start'] = start_date
    df['periodo_end'] = end_date
    
    # Renomear colunas se necessário
    col_map = {
        'Data': 'data',
        'Tipo': 'tipo',
        'Usuário': 'usuario',
        'Valor': 'valor',
        'Descrição': 'descricao'
    }
    
    for old, new in col_map.items():
        if old in df.columns:
            df[new] = df[old]
    
    # Selecionar apenas colunas necessárias
    cols = ['data', 'tipo', 'usuario', 'valor', 'descricao', 'periodo_start', 'periodo_end']
    df_save = df[[c for c in cols if c in df.columns]]
    
    # Salvar
    df_save.to_sql('extrato', conn, if_exists='append', index=False)
    
    conn.close()
    return len(df_save)

def calcular_saldo_por_usuario():
    """Calcular saldo acumulado por usuário"""
    conn = sqlite3.connect(DB_FILE)
    
    query = """
        SELECT 
            usuario,
            SUM(CASE WHEN tipo = 'Transferência' AND valor > 0 THEN valor ELSE 0 END) as carga,
            SUM(CASE WHEN tipo = 'Transferência' AND valor < 0 THEN ABS(valor) ELSE 0 END) as transferencia,
            SUM(CASE WHEN tipo = 'Taxa' THEN ABS(valor) ELSE 0 END) as tarifa
        FROM extrato
        GROUP BY usuario
    """
    
    df = pd.read_sql_query(query, conn)
    df['saldo'] = df['carga'] - df['transferencia'] - df['tarifa']
    
    conn.close()
    return df

def main():
    print("=" * 80)
    print("DOWNLOAD HISTORICO DE EXTRATO VIA API")
    print("=" * 80)
    
    # Inicializar banco
    init_database()
    
    # Definir período (ex: 3 meses)
    START_DATE = "2026-03-01"
    END_DATE = "2026-05-31"
    
    print(f"\nPeríodo: {START_DATE} a {END_DATE}")
    
    # Dividir em chunks de 15 dias
    chunks = dividir_periodo(START_DATE, END_DATE, max_dias=15)
    print(f"Total de chunks: {len(chunks)}")
    
    # Download de cada chunk
    total_registros = 0
    falhas = []
    
    for i, (start, end) in enumerate(chunks, 1):
        print(f"\n[{i}/{len(chunks)}] Baixando {start} a {end}...")
        
        df, erro = download_extrato(start, end)
        
        if erro:
            print(f"  ✗ Erro: {erro}")
            falhas.append((start, end, erro))
        else:
            registros = salvar_no_banco(df, start, end)
            total_registros += registros
            print(f"  ✓ {registros} registros salvos")
        
        # Pausa entre requisições
        if i < len(chunks):
            time.sleep(3)
    
    # Resumo
    print("\n" + "=" * 80)
    print("RESUMO")
    print("=" * 80)
    print(f"Chunks processados: {len(chunks) - len(falhas)}/{len(chunks)}")
    print(f"Total de registros: {total_registros}")
    print(f"Falhas: {len(falhas)}")
    
    if falhas:
        print("\nFalhas:")
        for start, end, erro in falhas:
            print(f"  {start} a {end}: {erro}")
    
    # Calcular saldos
    print("\n" + "=" * 80)
    print("SALDO POR USUARIO (Top 10)")
    print("=" * 80)
    
    df_saldos = calcular_saldo_por_usuario()
    df_saldos = df_saldos.sort_values('saldo', ascending=False)
    
    print(df_saldos.head(10).to_string(index=False))
    
    # Salvar resultado
    output = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/saldos_calculados.csv")
    df_saldos.to_csv(output, index=False)
    print(f"\n✓ Saldos salvos em: {output}")

if __name__ == "__main__":
    main()
