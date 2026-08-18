#!/usr/bin/env python3
"""
Gerador automatico da planilha Carga Quinzenal - VERSAO FINAL
Todas as colunas automaticas exceto: col_1qz, adiantamento, obs

Fórmulas confirmadas:
- colaborador, situacao, regional, centro_de_custo, gestor, diretor, status_do_cartao: controle_painel
- saldo_final: max(controle_painel.saldo_final, 0)
- saldo_reembolsar: abs(painel.saldo_final) se negativo, senao 0
- saldo_cartao: calculado via API (ultimo snapshot antes do fechamento - transacoes posteriores)
- reembolso: saldo_reembolsar / 2
- carga_parcial: col_1qz - saldo_final - saldo_cartao - adiantamento
- carga_final: max(carga_parcial + reembolso, 0)
"""

import pandas as pd
import sqlite3
import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from difflib import SequenceMatcher

# Configuracoes
DB_FILE = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/historico_extrato.db")
CONTROLE_PAINEL = Path("c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")

def find_user_match(nome_carga, usuarios_banco):
    """Encontra o melhor match de usuario no banco"""
    nome_clean = nome_carga.strip().upper()
    
    # Match exato
    for usuario in usuarios_banco:
        if usuario.upper() == nome_clean:
            return usuario, 1.0
    
    # Fuzzy match
    best_ratio = 0
    best_match = None
    for usuario in usuarios_banco:
        ratio = SequenceMatcher(None, nome_clean, usuario.upper()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = usuario
    
    if best_ratio >= 0.8:
        return best_match, best_ratio
    return None, best_ratio

def calcular_saldo_cartao(usuario, data_fechamento, conn):
    """
    Calcula o saldo do cartao no fechamento:
    1. Pega o ultimo snapshot antes do fechamento
    2. Subtrai todas as transacoes entre o snapshot e o fechamento
    """
    # Buscar ultimo snapshot antes do fechamento
    query_snap = """
        SELECT data, valor
        FROM extrato 
        WHERE usuario = ?
        AND (tipo IS NULL OR tipo = '')
        AND date(data) <= date(?)
        ORDER BY data DESC
        LIMIT 1
    """
    df_snap = pd.read_sql_query(query_snap, conn, params=(usuario, data_fechamento))
    
    if len(df_snap) == 0:
        return None, None
    
    snap_data = df_snap.iloc[0]['data']
    snap_valor = df_snap.iloc[0]['valor']
    
    # Buscar transacoes entre o snapshot e o fechamento
    query_trans = """
        SELECT tipo, valor
        FROM extrato 
        WHERE usuario = ?
        AND date(data) > date(?) 
        AND date(data) <= date(?)
        AND (tipo IS NOT NULL AND tipo != '')
        ORDER BY data
    """
    df_trans = pd.read_sql_query(query_trans, conn, params=(usuario, snap_data, data_fechamento))
    
    # Calcular saldo: snapshot + soma das transacoes
    saldo = snap_valor
    if len(df_trans) > 0:
        saldo += df_trans['valor'].sum()
    
    return saldo, snap_data[:10] if snap_data else None

def gerar_carga_qz(manuais_file=None, data_fechamento='2026-05-10', output_file=None):
    """Gera a planilha de carga quinzenal"""
    
    print("=" * 80)
    print("GERADOR DE CARGA QUINZENAL - AUTOMATICO")
    print("=" * 80)
    print(f"Data de fechamento: {data_fechamento}")
    
    # Carregar dados de controle
    print("\n[1/4] Carregando dados de controle...")
    df_painel = pd.read_excel(CONTROLE_PAINEL, sheet_name="PAINEL", header=10)
    
    # Limpar linhas vazias
    df_painel = df_painel[df_painel['COLABORADOR'].notna()].reset_index(drop=True)
    
    # Limpar CPF
    df_painel['CPF'] = df_painel['CPF'].astype(str).str.replace(r'\D', '', regex=True).str.zfill(11)
    
    # Carregar manuais se fornecido
    manuais = {}
    if manuais_file and Path(manuais_file).exists():
        with open(manuais_file, 'r') as f:
            manuais = json.load(f)
        print(f"Carregados {len(manuais)} registros manuais")
    
    # Conectar ao banco
    conn = sqlite3.connect(DB_FILE)
    
    # Buscar usuarios do banco
    query_users = "SELECT DISTINCT usuario FROM extrato WHERE usuario IS NOT NULL"
    df_users = pd.read_sql_query(query_users, conn)
    usuarios_banco = df_users['usuario'].tolist()
    
    print(f"[2/4] {len(usuarios_banco)} usuarios no banco de dados")
    
    # Preparar resultado
    resultados = []
    nao_encontrados = []
    
    print("[3/4] Processando colaboradores...")
    
    for _, row_painel in df_painel.iterrows():
        cpf = row_painel['CPF']
        nome = row_painel['COLABORADOR']
        
        # Dados do painel
        situacao = row_painel.get('SITUAÇÃO', 'ATIVO')
        regional = row_painel.get('REGIONAL', '')
        centro_custo = row_painel.get('CENTRO DE CUSTO', '')
        gestor = row_painel.get('GESTOR', '')
        diretor = row_painel.get('DIRETOR', '')
        status_cartao = row_painel.get('STATUS DO CARTÃO', 'Cartão ativo')
        
        # Saldo final e reembolsar
        try:
            saldo_final_painel = float(row_painel.get('SALDO FINAL', 0)) if pd.notna(row_painel.get('SALDO FINAL')) else 0
        except (ValueError, TypeError):
            saldo_final_painel = 0
        saldo_final = max(saldo_final_painel, 0)
        saldo_reembolsar = abs(saldo_final_painel) if saldo_final_painel < 0 else 0
        
        # Dados manuais
        manual = manuais.get(cpf, {})
        col_1qz = manual.get('col_1qz', 0)
        adiantamento = manual.get('adiantamento', 0)
        obs = manual.get('obs', '')
        
        # Calcular saldo cartao via API
        match, ratio = find_user_match(nome, usuarios_banco)
        
        if match:
            saldo_cartao, data_snap = calcular_saldo_cartao(match, data_fechamento, conn)
            if saldo_cartao is None:
                saldo_cartao = 0
                data_snap = None
        else:
            saldo_cartao = 0
            data_snap = None
            nao_encontrados.append(nome)
        
        # Calcular reembolso
        reembolso = saldo_reembolsar / 2
        
        # Calcular carga parcial
        carga_parcial = col_1qz - saldo_final - saldo_cartao - adiantamento
        
        # Calcular carga final
        carga_final = max(carga_parcial + reembolso, 0)
        
        resultados.append({
            'COLABORADOR': nome,
            'CPF': cpf,
            'SITUAÇÃO': situacao,
            'REGIONAL': regional,
            'CENTRO DE CUSTO': centro_custo,
            'GESTOR': gestor,
            'DIRETOR': diretor,
            'STATUS DO CARTÃO': status_cartao,
            'SALDO FINAL': saldo_final,
            'SALDO REEMBOLSAR': saldo_reembolsar,
            'SALDO CARTAO': saldo_cartao,
            'REEMBOLSO': reembolso,
            '1ª QZ': col_1qz,
            'ADIANTAMENTO': adiantamento,
            'CARGA PARCIAL': carga_parcial,
            'CARGA FINAL': carga_final,
            'OBS': obs,
            '_data_snapshot': data_snap,  # para debug
            '_match_ratio': ratio if match else 0  # para debug
        })
    
    conn.close()
    
    print(f"[4/4] Processados {len(resultados)} colaboradores")
    
    if len(nao_encontrados) > 0:
        print(f"\n⚠️  {len(nao_encontrados)} colaboradores nao encontrados no banco:")
        for nome in nao_encontrados[:10]:
            print(f"   - {nome}")
    
    # Criar DataFrame
    df_result = pd.DataFrame(resultados)
    
    # Remover colunas de debug
    df_debug = df_result[['COLABORADOR', '_data_snapshot', '_match_ratio']].copy()
    df_result = df_result.drop(columns=['_data_snapshot', '_match_ratio'])
    
    # Salvar
    if output_file:
        output_path = Path(output_file)
    else:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = Path(f"c:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/carga_qz_gerada_{timestamp}.xlsx")
    
    # Criar Excel com abas
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df_result.to_excel(writer, sheet_name='Carga Quinzenal', index=False)
        df_debug.to_excel(writer, sheet_name='Debug', index=False)
    
    print(f"\n✅ Planilha gerada: {output_path}")
    
    # Resumo
    print("\n" + "=" * 80)
    print("RESUMO DA GERACAO")
    print("=" * 80)
    print(f"Total colaboradores: {len(df_result)}")
    print(f"Encontrados no banco: {len(df_result) - len(nao_encontrados)}")
    print(f"Nao encontrados: {len(nao_encontrados)}")
    print(f"\nTotais calculados:")
    print(f"  SALDO FINAL: R$ {df_result['SALDO FINAL'].sum():,.2f}")
    print(f"  SALDO REEMBOLSAR: R$ {df_result['SALDO REEMBOLSAR'].sum():,.2f}")
    print(f"  SALDO CARTAO: R$ {df_result['SALDO CARTAO'].sum():,.2f}")
    print(f"  REEMBOLSO: R$ {df_result['REEMBOLSO'].sum():,.2f}")
    print(f"  CARGA PARCIAL: R$ {df_result['CARGA PARCIAL'].sum():,.2f}")
    print(f"  CARGA FINAL: R$ {df_result['CARGA FINAL'].sum():,.2f}")
    print("\n" + "=" * 80)
    
    return output_path

def main():
    parser = argparse.ArgumentParser(description='Gerar planilha Carga Quinzenal automaticamente')
    parser.add_argument('--manuais', help='Arquivo JSON com dados manuais (col_1qz, adiantamento, obs)')
    parser.add_argument('--fechamento', default='2026-05-10', help='Data de fechamento (YYYY-MM-DD)')
    parser.add_argument('--output', help='Caminho do arquivo de saida')
    
    args = parser.parse_args()
    
    gerar_carga_qz(
        manuais_file=args.manuais,
        data_fechamento=args.fechamento,
        output_file=args.output
    )

if __name__ == "__main__":
    main()
