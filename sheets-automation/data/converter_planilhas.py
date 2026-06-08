import pandas as pd
import json
import os
from pathlib import Path
import pyxlsb

def converter_xlsx_para_json(caminho_entrada, caminho_saida):
    """Converte arquivo XLSX para JSON"""
    try:
        # Ler todas as abas
        excel_file = pd.ExcelFile(caminho_entrada)
        dados_json = {}
        
        for sheet_name in excel_file.sheet_names:
            # Ler dados da aba
            df = pd.read_excel(caminho_entrada, sheet_name=sheet_name)
            
            # Converter para formato de lista de listas (mantendo estrutura)
            dados = []
            
            # Adicionar cabeçalho
            if not df.empty:
                cabecalho = list(df.columns)
                dados.append(cabecalho)
                
                # Adicionar linhas de dados
                for _, row in df.iterrows():
                    linha = []
                    for col in cabecalho:
                        valor = row.get(col, '')
                        # Converter NaN para string vazia
                        if pd.isna(valor):
                            valor = ''
                        else:
                            valor = str(valor)
                        linha.append(valor)
                    dados.append(linha)
            
            dados_json[sheet_name] = dados
            
        # Salvar como JSON
        with open(caminho_saida, 'w', encoding='utf-8') as f:
            json.dump(dados_json, f, ensure_ascii=False, indent=2)
            
        return True, f"Convertido com sucesso! {len(dados_json)} abas processadas"
        
    except Exception as e:
        return False, f"Erro ao converter XLSX: {str(e)}"

def converter_xlsb_para_json(caminho_entrada, caminho_saida):
    """Converte arquivo XLSB para JSON"""
    try:
        # Ler arquivo XLSB
        dados_json = {}
        
        with pd.ExcelFile(caminho_entrada, engine='pyxlsb') as excel_file:
            for sheet_name in excel_file.sheet_names:
                # Ler dados da aba
                df = pd.read_excel(caminho_entrada, sheet_name=sheet_name, engine='pyxlsb')
                
                # Converter para formato de lista de listas
                dados = []
                
                # Adicionar cabeçalho
                if not df.empty:
                    cabecalho = list(df.columns)
                    dados.append(cabecalho)
                    
                    # Adicionar linhas de dados
                    for _, row in df.iterrows():
                        linha = []
                        for col in cabecalho:
                            valor = row.get(col, '')
                            # Converter NaN para string vazia
                            if pd.isna(valor):
                                valor = ''
                            else:
                                valor = str(valor)
                            linha.append(valor)
                        dados.append(linha)
                
                dados_json[sheet_name] = dados
        
        # Salvar como JSON
        with open(caminho_saida, 'w', encoding='utf-8') as f:
            json.dump(dados_json, f, ensure_ascii=False, indent=2)
            
        return True, f"Convertido com sucesso! {len(dados_json)} abas processadas"
        
    except Exception as e:
        return False, f"Erro ao converter XLSB: {str(e)}"

def main():
    # Caminhos dos arquivos
    pasta_sheets = Path("../sheets")
    pasta_convertidos = Path("converted")
    pasta_convertidos.mkdir(exist_ok=True)
    
    # Arquivos para converter
    arquivos = [
        ("CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx", "carga_maio_2026.json"),
        ("CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb", "controle_maio_2026.json")
    ]
    
    print("🔄 Convertendo planilhas...")
    
    for nome_arquivo, nome_saida in arquivos:
        caminho_entrada = pasta_sheets / nome_arquivo
        caminho_saida = pasta_convertidos / nome_saida
        
        if not caminho_entrada.exists():
            print(f"❌ Arquivo não encontrado: {caminho_entrada}")
            continue
            
        print(f"\n📁 Processando: {nome_arquivo}")
        
        # Determinar tipo de arquivo e converter
        if nome_arquivo.endswith('.xlsx'):
            sucesso, mensagem = converter_xlsx_para_json(caminho_entrada, caminho_saida)
        elif nome_arquivo.endswith('.xlsb'):
            sucesso, mensagem = converter_xlsb_para_json(caminho_entrada, caminho_saida)
        else:
            sucesso, mensagem = False, f"Formato não suportado: {nome_arquivo}"
        
        if sucesso:
            print(f"✅ {mensagem}")
            print(f"💾 Salvo em: {caminho_saida}")
            
            # Mostrar estatísticas
            with open(caminho_saida, 'r', encoding='utf-8') as f:
                dados = json.load(f)
                for nome_aba, linhas in dados.items():
                    print(f"   - {nome_aba}: {len(linhas)} linhas")
        else:
            print(f"❌ {mensagem}")
    
    print(f"\n🎉 Conversão concluída! Arquivos salvos em: {pasta_convertidos}")

if __name__ == "__main__":
    main()
