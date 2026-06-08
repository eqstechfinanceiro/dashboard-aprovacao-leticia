#!/usr/bin/env python3
"""
Converte CONTROLE - VEXPENSES - ABRIL- 2026.xlsb para .xlsx
para poder ler fórmulas com openpyxl
"""

import pandas as pd
from pathlib import Path


def convert_xlsb_to_xlsx():
    """Converte arquivo .xlsb para .xlsx."""
    filepath = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsb"
    output_path = Path(__file__).parent / "CONTROLE - VEXPENSES - ABRIL- 2026.xlsx"
    
    if not filepath.exists():
        print(f"❌ Arquivo não encontrado: {filepath}")
        return False
    
    print("🔄 Convertendo .xlsb para .xlsx...")
    
    try:
        # Ler todas as abas
        xlsb = pd.ExcelFile(filepath, engine='pyxlsb')
        
        # Criar writer para .xlsx
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            for sheet_name in xlsb.sheet_names:
                print(f"  Convertendo aba: {sheet_name}")
                df = pd.read_excel(xlsb, sheet_name=sheet_name)
                df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        print(f"✅ Conversão concluída: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ Erro na conversão: {e}")
        return False


if __name__ == "__main__":
    convert_xlsb_to_xlsx()
