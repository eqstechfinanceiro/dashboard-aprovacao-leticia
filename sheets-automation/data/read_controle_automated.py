#!/usr/bin/env python3
"""
Lê arquivo CONTROLE automaticamente e extrai dados financeiros
Solução curto prazo para automação de quinzenas futuras
"""

import json
from pathlib import Path

from pyxlsb import open_workbook


def norm_cpf(v):
    """Normaliza CPF removendo caracteres não numéricos"""
    if not v:
        return ''
    return str(v).replace('.', '').replace('-', '').replace('/', '').strip()


def extract_quinzenas(filepath):
    """Extrai dados da aba QUINZENAS"""
    print("📊 Extraindo dados de QUINZENAS...")
    
    quinzenas = {}
    
    wb = open_workbook(filepath)
    
    if 'QUINZENAS' in list(wb.sheets):
        with wb.get_sheet('QUINZENAS') as sheet:
            rows = []
            for row_idx, row in enumerate(sheet.rows()):
                if row_idx >= 1000:
                    break
                
                row_data = []
                for cell in row:
                    if cell and cell.v is not None:
                        row_data.append(str(cell.v))
                    else:
                        row_data.append("")
                
                if any(row_data):
                    rows.append(row_data)
            
            # Header está na linha 2 (idx 1)
            if len(rows) >= 2:
                header = rows[1]
                
                # Encontrar índices
                cpf_idx = None
                valor_idx = None
                qz_idx = None
                mes_idx = None
                ano_idx = None
                
                for i, h in enumerate(header):
                    h_upper = str(h).upper()
                    if 'CPF' in h_upper:
                        cpf_idx = i
                    elif 'VALOR' in h_upper:
                        valor_idx = i
                    elif 'QUINZENA' in h_upper:
                        qz_idx = i
                    elif 'M' in h_upper and len(h) == 1:
                        mes_idx = i
                    elif 'ANO' in h_upper:
                        ano_idx = i
                
                # Extrair dados
                for row in rows[2:]:
                    indices = [idx for idx in [cpf_idx, valor_idx, qz_idx, mes_idx, ano_idx] if idx is not None]
                    if indices and len(row) > max(indices):
                        cpf = norm_cpf(row[cpf_idx]) if cpf_idx is not None and cpf_idx < len(row) else ''
                        valor = float(row[valor_idx]) if valor_idx is not None and valor_idx < len(row) and row[valor_idx] else 0
                        qz = row[qz_idx] if qz_idx is not None and qz_idx < len(row) else ''
                        mes = row[mes_idx] if mes_idx is not None and mes_idx < len(row) else ''
                        ano = row[ano_idx] if ano_idx is not None and ano_idx < len(row) else ''
                        
                        if cpf and valor:
                            key = f"{cpf}_{ano}_{mes}_{qz}"
                            quinzenas[key] = {
                                'cpf': cpf,
                                'valor': valor,
                                'quinzena': qz,
                                'mes': mes,
                                'ano': ano
                            }
    
    wb.close()
    
    print(f"✅ Quinzenas extraídas: {len(quinzenas)}")
    return quinzenas


def extract_saldo_cartao(filepath):
    """Extrai dados da aba SALDO CARTAO"""
    print("📊 Extraindo dados de SALDO CARTAO...")
    
    saldo_cartao = {}
    
    wb = open_workbook(filepath)
    
    if 'SALDO CARTAO' in list(wb.sheets):
        with wb.get_sheet('SALDO CARTAO') as sheet:
            rows = []
            for row_idx, row in enumerate(sheet.rows()):
                if row_idx >= 1000:
                    break
                
                row_data = []
                for cell in row:
                    if cell and cell.v is not None:
                        row_data.append(str(cell.v))
                    else:
                        row_data.append("")
                
                if any(row_data):
                    rows.append(row_data)
            
            # Header está na linha 2 (idx 1)
            if len(rows) >= 2:
                # Extrair dados (CPF col 2, VALOR col 3, DATA col 4)
                for row in rows[2:]:
                    if len(row) >= 5:
                        cpf = norm_cpf(row[2]) if row[2] else ''
                        valor = float(row[3]) if row[3] else 0
                        data = row[4] if row[4] else ''
                        
                        if cpf and valor:
                            if cpf not in saldo_cartao:
                                saldo_cartao[cpf] = []
                            saldo_cartao[cpf].append({
                                'valor': valor,
                                'data': data
                            })
    
    wb.close()
    
    print(f"✅ Saldo cartão extraído: {len(saldo_cartao)}")
    return saldo_cartao


def extract_adicionais(filepath):
    """Extrai dados da aba ADICIONAIS"""
    print("📊 Extraindo dados de ADICIONAIS...")
    
    adicionais = {}
    
    wb = open_workbook(filepath)
    
    if 'ADICIONAIS' in list(wb.sheets):
        with wb.get_sheet('ADICIONAIS') as sheet:
            rows = []
            for row_idx, row in enumerate(sheet.rows()):
                if row_idx >= 1000:
                    break
                
                row_data = []
                for cell in row:
                    if cell and cell.v is not None:
                        row_data.append(str(cell.v))
                    else:
                        row_data.append("")
                
                if any(row_data):
                    rows.append(row_data)
            
            # Header está na linha 2 (idx 1)
            if len(rows) >= 2:
                # Extrair dados (CPF col 2, VALOR col 3, DATA col 4)
                for row in rows[2:]:
                    if len(row) >= 5:
                        cpf = norm_cpf(row[2]) if row[2] else ''
                        valor = float(row[3]) if row[3] else 0
                        data = row[4] if row[4] else ''
                        
                        if cpf and valor:
                            if cpf not in adicionais:
                                adicionais[cpf] = []
                            adicionais[cpf].append({
                                'valor': valor,
                                'data': data
                            })
    
    wb.close()
    
    print(f"✅ Adicionais extraídos: {len(adicionais)}")
    return adicionais


def read_controle(filepath):
    """Lê arquivo CONTROLE e extrai todos os dados financeiros"""
    print(f"🎯 Lendo arquivo CONTROLE: {filepath}\n")
    print("=" * 60)
    
    if not Path(filepath).exists():
        print(f"❌ Arquivo não encontrado: {filepath}")
        return None
    
    # Extrair dados de todas as abas
    quinzenas = extract_quinzenas(filepath)
    saldo_cartao = extract_saldo_cartao(filepath)
    adicionais = extract_adicionais(filepath)
    
    # Consolidar dados
    financial_data = {
        'quinzenas': quinzenas,
        'saldo_cartao': saldo_cartao,
        'adicionais': adicionais,
        'metadata': {
            'source_file': str(filepath),
            'total_quinzenas': len(quinzenas),
            'total_saldo_cartao': len(saldo_cartao),
            'total_adicionais': len(adicionais)
        }
    }
    
    return financial_data


def main():
    print("🎯 LEITURA AUTOMATIZADA DO CONTROLE\n")
    print("=" * 60)
    
    # Definir arquivo CONTROLE
    filepath = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsb"
    
    # Ler arquivo
    financial_data = read_controle(filepath)
    
    if not financial_data:
        return
    
    # Salvar resultados
    output_path = Path(__file__).parent / "controle_financial_data.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(financial_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n📁 Dados salvos: {output_path}")
    
    print(f"\n📊 Resumo:")
    print(f"  Quinzenas: {financial_data['metadata']['total_quinzenas']}")
    print(f"  Saldo Cartão: {financial_data['metadata']['total_saldo_cartao']}")
    print(f"  Adicionais: {financial_data['metadata']['total_adicionais']}")
    
    print("\n💡 PRÓXIMOS PASSOS:")
    print("1. Integrar JSON no dashboard")
    print("2. Criar endpoint para ler dados automaticamente")
    print("3. Configurar processo para rodar a cada quinzena")
    print("4. Notificar quando novos dados estão disponíveis")


if __name__ == "__main__":
    main()
