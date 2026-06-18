"""
Script de teste para validar dados da API v3/pay/statement vs planilha Controle
Compara Saldo Cartão e Saldo Final calculados do extrato API com a planilha de controle
"""

import requests
import pandas as pd
import openpyxl
from io import BytesIO
from pathlib import Path
from datetime import datetime
import json

# === CONFIGURAÇÃO ===
# Token Laravel (capturado do browser - substituir quando expirar)
# É um cookie criptografado pelo Laravel - enviado direto, servidor decifra
LARAVEL_TOKEN = "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0="

COOKIES = {
    "language": "pt-BR",
    "laravel_token": LARAVEL_TOKEN,
    "GACID": "GACID1825947",
    "GAUID": "GAUID1155319",
}

HEADERS = {
    "accept": "application/json",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "origin": "https://amp.vexpenses.com",
    "referer": "https://amp.vexpenses.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
}

# Períodos para testar (1ª e 2ª quinzena de maio/2026)
PERIODOS_TESTE = [
    {"nome": "1ª QZ Maio 2026", "inicio": "2026-05-01", "fim": "2026-05-15"},
    {"nome": "2ª QZ Maio 2026", "inicio": "2026-05-16", "fim": "2026-05-31"},
]

# Caminho da planilha de controle (usa raw string para evitar problemas de encoding)
CONTROLE_PATH = Path(r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\data\CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
OUTPUT_DIR = Path("./resultados")


def baixar_extrato_api(start_date: str, end_date: str) -> pd.DataFrame:
    """
    Baixa o extrato de todos os cartões via API v3/pay/statement/excel-all
    Retorna DataFrame processado
    """
    url = "https://api.vexpenses.com/v3/pay/statement/excel-all"
    params = {"start_date": start_date, "end_date": end_date}

    print(f"\n[API] Chamando: {url}")
    print(f"      Período: {start_date} a {end_date}")

    # Passo 1: Obter URL do S3 (timeout maior pois às vezes demora)
    response = requests.get(url, params=params, headers=HEADERS, cookies=COOKIES, timeout=60)
    response.raise_for_status()

    data = response.json()
    if not data.get("success"):
        raise Exception(f"API retornou erro: {data}")

    xlsx_url = data["data"]["url"]
    print(f"      URL S3 obtida: {xlsx_url[:80]}...")

    # Passo 2: Baixar o XLSX
    print("      Baixando XLSX...")
    xlsx_response = requests.get(xlsx_url, timeout=120)
    xlsx_response.raise_for_status()

    print(f"      XLSX baixado: {len(xlsx_response.content) / 1024:.1f} KB")

    # Passo 3: Ler o XLSX
    df = pd.read_excel(BytesIO(xlsx_response.content), sheet_name="Extrato", header=0)
    print(f"   Linhas no extrato: {len(df)}")

    return df


def processar_extrato(df: pd.DataFrame) -> dict:
    """
    Processa o DataFrame do extrato da API v3/pay/statement/excel-all.

    Estrutura do extrato:
    - Data, Hora, Código de Transação, Número do Cartão, Grupo, Usuário,
      Tipo, Descrição, Valor, Status, ID da Despesa, ID do Relatório, ...

    Lógica descoberta:
    - Linhas com Hora = "-" e Tipo = NaN são linhas de SALDO/HEADER
    - O Valor nessas linhas representa o SALDO DO CARTÃO
    - As demais linhas são movimentações (Transferência, Compra, Taxa, etc.)

    Cálculos:
    - SALDO CARTÃO = valor da linha de header (Hora="-", Tipo=NaN)
    - SALDO FINAL = CARGA - DESCARGA - TARIFA (variação do período)
    """
    resultados = {}

    print(f"   Colunas no extrato: {list(df.columns)}")

    # Normalizar nomes de colunas (remover acentos, espaços)
    col_map = {}
    for col in df.columns:
        col_clean = str(col).upper().strip()
        col_map[col] = col_clean

    # Encontrar colunas relevantes
    col_hora = None
    col_tipo = None
    col_valor = None
    col_usuario = None

    for orig, clean in col_map.items():
        if 'HORA' in clean:
            col_hora = orig
        elif 'TIPO' in clean and 'DESPESA' not in clean:
            col_tipo = orig
        elif 'VALOR' in clean:
            col_valor = orig
        elif 'USUARIO' in clean or 'USUÁRIO' in clean:
            col_usuario = orig

    print(f"   Mapeamento: Hora={col_hora}, Tipo={col_tipo}, Valor={col_valor}, Usuario={col_usuario}")

    # Agrupar por usuário
    for usuario, grupo in df.groupby(col_usuario):
        if pd.isna(usuario) or str(usuario).strip() in ["None", "", " ", "-"]:
            continue

        nome_normalizado = str(usuario).strip().upper()

        # Inicializar
        saldo_cartao = 0.0
        carga = 0.0
        descarga = 0.0
        tarifa = 0.0
        compras = 0.0
        saques = 0.0
        pix = 0.0
        estornos = 0.0
        estorno_taxa = 0.0

        for _, row in grupo.iterrows():
            hora = str(row.get(col_hora, "")).strip()
            tipo = str(row.get(col_tipo, "")).strip()
            valor = float(row.get(col_valor, 0) or 0)

            # Linha de saldo/Header: Hora = "-" e Tipo vazio/NaN
            if hora == "-" and (tipo == "" or tipo == "NAN" or pd.isna(row.get(col_tipo))):
                # Valor representa o saldo do cartão
                saldo_cartao = valor
                continue

            # Processar movimentações
            if "TRANSFERÊNCIA" in tipo.upper() or "TRANSFERENCIA" in tipo.upper():
                if valor > 0:
                    carga += valor
                else:
                    descarga += abs(valor)

            elif "TAXA" in tipo.upper():
                if valor > 0:
                    tarifa += valor
                else:
                    estorno_taxa += abs(valor)

            elif "COMPRA" in tipo.upper():
                compras += valor
                descarga += valor

            elif "SAQUE" in tipo.upper():
                saques += valor
                descarga += valor

            elif "PIX" in tipo.upper():
                pix += valor
                descarga += valor

            elif "ESTORNO" in tipo.upper():
                if "TAXA" in tipo.upper():
                    estorno_taxa += abs(valor)
                else:
                    estornos += abs(valor)
                    descarga -= abs(valor)  # Estorno reduz descarga

        # Saldo Final = variação no período (CARGA - DESCARGA - TARIFA)
        saldo_final = carga - descarga - tarifa

        resultados[nome_normalizado] = {
            "nome_api": nome_normalizado,
            "saldo_cartao_api": round(saldo_cartao, 2),
            "saldo_final_api": round(saldo_final, 2),
            "carga": round(carga, 2),
            "descarga": round(descarga, 2),
            "tarifa": round(tarifa, 2),
            "compras": round(compras, 2),
            "saques": round(saques, 2),
            "pix": round(pix, 2),
            "estornos": round(estornos, 2),
            "estorno_taxa": round(estorno_taxa, 2),
        }

    return resultados


def carregar_controle(path: Path) -> dict:
    """
    Carrega aba PAINEL da planilha de controle
    Retorna dict por CPF com: nome, saldo_cartao, saldo_final, situacao, regional, etc
    """
    print(f"\n[ARQUIVO] Carregando planilha de controle: {path.name}")

    # Aba PAINEL - cabeçalho na linha 11 (índice 10)
    df = pd.read_excel(path, sheet_name="PAINEL", header=10)
    print(f"   Colunas encontradas: {list(df.columns)[:10]}...")
    print(f"   Total de linhas: {len(df)}")

    resultados = {}

    for _, row in df.iterrows():
        # Pegar CPF (coluna B = índice 1, ou nome "CPF")
        cpf = None
        for col in ["CPF", "cpf", "Cpf"]:
            if col in df.columns:
                cpf = row.get(col)
                break

        if pd.isna(cpf) or cpf == "" or cpf == "CPF":
            continue

        # Normalizar CPF (remover pontos e traço)
        cpf_str = str(cpf).replace(".", "").replace("-", "").strip()
        if len(cpf_str) != 11 or not cpf_str.isdigit():
            continue

        # Pegar nome
        nome = None
        for col in ["COLABORADOR", "Colaborador", "colaborador", "NOME", "Nome"]:
            if col in df.columns:
                nome = str(row.get(col, "")).strip().upper()
                break

        if not nome:
            continue

        # Pegar saldos
        saldo_cartao = 0.0
        saldo_final = 0.0
        saldo_prestacao = 0.0

        for col in df.columns:
            col_upper = str(col).upper()
            if "SALDO CARTAO" in col_upper or "SALDO_CARTAO" in col_upper:
                val = row.get(col)
                if pd.notna(val) and str(val).strip():
                    try:
                        saldo_cartao = float(str(val).strip())
                    except ValueError:
                        pass
            elif "SALDO FINAL" in col_upper or "SALDO_FINAL" in col_upper:
                val = row.get(col)
                if pd.notna(val) and str(val).strip():
                    try:
                        saldo_final = float(str(val).strip())
                    except ValueError:
                        pass
            elif "PRESTA" in col_upper:
                val = row.get(col)
                if pd.notna(val) and str(val).strip():
                    try:
                        saldo_prestacao = float(str(val).strip())
                    except ValueError:
                        pass

        # Pegar outros campos
        situacao = str(row.get("SITUAÇÃO", row.get("SITUACAO", "ATIVO"))).strip()
        regional = str(row.get("REGIONAL", "")).strip()
        centro_custo = str(row.get("CENTRO DE CUSTO", row.get("CENTRO_DE_CUSTO", ""))).strip()
        gestor = str(row.get("GESTOR", "")).strip()
        diretor = str(row.get("DIRETOR", "")).strip()

        resultados[cpf_str] = {
            "cpf": cpf_str,
            "nome": nome,
            "nome_normalizado": nome,
            "saldo_cartao_planilha": round(saldo_cartao, 2),
            "saldo_final_planilha": round(saldo_final, 2),
            "saldo_prestacao_planilha": round(saldo_prestacao, 2),
            "situacao": situacao,
            "regional": regional,
            "centro_custo": centro_custo,
            "gestor": gestor,
            "diretor": diretor,
        }

    print(f"   Colaboradores válidos carregados: {len(resultados)}")
    return resultados


def comparar_dados(dados_api: dict, dados_controle: dict, periodo_nome: str) -> dict:
    """
    Compara dados da API com dados da planilha de controle
    Retorna relatório de diferenças
    """
    print(f"\n[COMPARACAO] API vs Controle ({periodo_nome})")

    # Criar índice por nome para cruzamento
    controle_por_nome = {}
    for cpf, dados in dados_controle.items():
        nome = dados["nome"]
        controle_por_nome[nome] = dados
        # Também tentar versão sem acentos
        nome_sem_acento = nome.replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
        controle_por_nome[nome_sem_acento] = dados

    comparacoes = []
    encontrados = 0
    nao_encontrados = []

    for nome_api, dados_api_item in dados_api.items():
        # Tentar cruzar por nome exato
        controle = controle_por_nome.get(nome_api)

        if not controle:
            # Tentar busca aproximada (primeiras palavras)
            nome_parts = nome_api.split()
            if len(nome_parts) >= 2:
                nome_abrev = f"{nome_parts[0]} {nome_parts[1]}"
                for nome_ctrl, dados_ctrl in controle_por_nome.items():
                    if nome_ctrl.startswith(nome_abrev):
                        controle = dados_ctrl
                        break

        if controle:
            encontrados += 1

            # Comparar saldos
            diff_cartao = abs(dados_api_item.get("saldo_cartao_api", 0) - controle["saldo_cartao_planilha"])
            diff_final = abs(dados_api_item.get("saldo_final_api", 0) - controle["saldo_final_planilha"])

            comparacoes.append({
                "nome_api": nome_api,
                "nome_controle": controle["nome"],
                "cpf": controle["cpf"],
                "saldo_cartao_api": dados_api_item.get("saldo_cartao_api", 0),
                "saldo_cartao_planilha": controle["saldo_cartao_planilha"],
                "diff_cartao": round(diff_cartao, 2),
                "saldo_final_api": dados_api_item.get("saldo_final_api", 0),
                "saldo_final_planilha": controle["saldo_final_planilha"],
                "diff_final": round(diff_final, 2),
                "carga_api": dados_api_item.get("carga", 0),
                "encontrado": True,
            })
        else:
            nao_encontrados.append(nome_api)

    # Estatísticas
    total_api = len(dados_api)
    total_controle = len(dados_controle)

    stats = {
        "periodo": periodo_nome,
        "total_api": total_api,
        "total_controle": total_controle,
        "encontrados": encontrados,
        "taxa_cruzamento": round(encontrados / total_api * 100, 1) if total_api > 0 else 0,
        "nao_encontrados_api": nao_encontrados[:10],  # Primeiros 10
        "comparacoes": comparacoes,
    }

    # Calcular correlação para quem foi encontrado
    if comparacoes:
        diffs_cartao = [c["diff_cartao"] for c in comparacoes]
        diffs_final = [c["diff_final"] for c in comparacoes]

        stats["media_diff_cartao"] = round(sum(diffs_cartao) / len(diffs_cartao), 2)
        stats["media_diff_final"] = round(sum(diffs_final) / len(diffs_final), 2)
        stats["max_diff_cartao"] = round(max(diffs_cartao), 2)
        stats["max_diff_final"] = round(max(diffs_final), 2)
        stats["diff_zero_cartao"] = sum(1 for d in diffs_cartao if d == 0)
        stats["diff_zero_final"] = sum(1 for d in diffs_final if d == 0)

    return stats


def gerar_relatorio(stats_list: list, output_dir: Path):
    """Gera relatório HTML e JSON com resultados"""
    output_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Salvar JSON
    json_path = output_dir / f"relatorio_teste_{timestamp}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(stats_list, f, indent=2, ensure_ascii=False)
    print(f"\n[SALVO] Relatório JSON: {json_path}")

    # Criar resumo CSV das comparações
    todas_comparacoes = []
    for stats in stats_list:
        for comp in stats["comparacoes"]:
            comp["periodo"] = stats["periodo"]
            todas_comparacoes.append(comp)

    if todas_comparacoes:
        df_comp = pd.DataFrame(todas_comparacoes)
        csv_path = output_dir / f"comparacao_detalhada_{timestamp}.csv"
        df_comp.to_csv(csv_path, index=False, encoding="utf-8-sig")
        print(f"[SALVO] Comparacao CSV: {csv_path}")

    # Resumo no console
    print("\n" + "=" * 60)
    print("[RESUMO] TESTES")
    print("=" * 60)

    for stats in stats_list:
        print(f"\n[PERIODO] {stats['periodo']}")
        print(f"   Total API: {stats['total_api']} colaboradores")
        print(f"   Total Controle: {stats['total_controle']} colaboradores")
        print(f"   Cruzados: {stats['encontrados']} ({stats['taxa_cruzamento']}%)")

        if stats.get("media_diff_cartao") is not None:
            print(f"   Média diferença Saldo Cartão: R$ {stats['media_diff_cartao']:.2f}")
            print(f"   Média diferença Saldo Final: R$ {stats['media_diff_final']:.2f}")
            print(f"   Exatos (Cartão): {stats['diff_zero_cartao']}/{stats['encontrados']}")
            print(f"   Exatos (Final): {stats['diff_zero_final']}/{stats['encontrados']}")

        if stats["nao_encontrados_api"]:
            print(f"   [AVISO] Nao encontrados: {', '.join(stats['nao_encontrados_api'][:5])}")

    print("\n" + "=" * 60)


def main():
    import sys
    import traceback

    print("=" * 60)
    print("[TESTE] API v3/pay/statement vs Planilha Controle")
    print("=" * 60)
    sys.stdout.flush()

    # Verificar se planilha existe
    if not CONTROLE_PATH.exists():
        print(f"[ERRO] Planilha nao encontrada: {CONTROLE_PATH}")
        print(f"   Diretório atual: {Path.cwd()}")
        return

    # Carregar planilha de controle (única, usada para ambos períodos)
    dados_controle = carregar_controle(CONTROLE_PATH)

    if not dados_controle:
        print("[ERRO] Nenhum colaborador valido na planilha de controle")
        return

    all_stats = []

    # Testar cada período
    for periodo in PERIODOS_TESTE:
        try:
            print(f"\n{'=' * 60}")
            print(f"[TESTE] Periodo: {periodo['nome']}")
            print(f"{'=' * 60}")

            # 1. Baixar extrato da API
            df_extrato = baixar_extrato_api(periodo["inicio"], periodo["fim"])

            # 2. Processar extrato
            dados_api = processar_extrato(df_extrato)
            print(f"   Colaboradores no extrato: {len(dados_api)}")

            # 3. Comparar com controle
            stats = comparar_dados(dados_api, dados_controle, periodo["nome"])
            all_stats.append(stats)

        except Exception as e:
            print(f"[ERRO] No periodo {periodo['nome']}: {e}")
            import traceback
            traceback.print_exc()

    # 4. Gerar relatório
    if all_stats:
        gerar_relatorio(all_stats, OUTPUT_DIR)
    else:
        print("\n[ERRO] Nenhum resultado para gerar relatorio")

    print("\n[OK] Teste concluido!")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import sys, traceback
        print(f"\n[ERRO FATAL] {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
