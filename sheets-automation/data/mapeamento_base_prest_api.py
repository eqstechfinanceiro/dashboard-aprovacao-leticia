#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 MAPEAMENTO COLUNAS BASE PREST -> API VEXPENSES
Define como cada coluna da BASE PREST é obtida da API
"""

mapeamento = {
    # Colunas da API (não calculadas)
    0: {"coluna": "ID da Despesa", "origem": "expenses.id", "endpoint": "/expenses"},
    1: {"coluna": "ID do Relatório", "origem": "expenses.report_id", "endpoint": "/expenses"},
    2: {"coluna": "Nome do relatório", "origem": "report.description", "endpoint": "/expenses?include=report"},
    3: {"coluna": "Data", "origem": "expenses.date", "endpoint": "/expenses"},
    4: {"coluna": "Nome do membro de equipe", "origem": "user.name", "endpoint": "/expenses?include=user"},
    5: {"coluna": "Banco", "origem": "user.bank", "endpoint": "/expenses?include=user"},
    6: {"coluna": "Agência", "origem": "user.agency", "endpoint": "/expenses?include=user"},
    7: {"coluna": "Conta", "origem": "user.account", "endpoint": "/expenses?include=user"},
    8: {"coluna": "Pix", "origem": "user.pix_key", "endpoint": "/expenses?include=user"},
    9: {"coluna": "CPF/CNPJ", "origem": "user.cpf", "endpoint": "/expenses?include=user"},
    10: {"coluna": "Status", "origem": "report.status", "endpoint": "/expenses?include=report"},
    11: {"coluna": "Data de Pagamento", "origem": "report.payment_date", "endpoint": "/expenses?include=report"},
    12: {"coluna": "Descrição da despesa", "origem": "expenses.title", "endpoint": "/expenses"},
    13: {"coluna": "Tipo de Despesa", "origem": "expense_type.name", "endpoint": "/expenses?include=expense_type"},
    14: {"coluna": "Reembolsável", "origem": "expenses.reimbursable", "endpoint": "/expenses"},
    15: {"coluna": "Anotação da Despesa", "origem": "expenses.observation", "endpoint": "/expenses"},
    16: {"coluna": "Anotação de Rateio", "origem": "apportionment", "endpoint": "/expenses?include=apportionment"},
    17: {"coluna": "Centro de Custos", "origem": "costs_center.name", "endpoint": "/expenses?include=costs_center"},
    18: {"coluna": "Forma de pagamento", "origem": "payment_method.name", "endpoint": "/expenses?include=payment_method"},
    19: {"coluna": "Projeto", "origem": "route.name", "endpoint": "/expenses?include=route"},
    20: {"coluna": "Percentual de projeto", "origem": "apportionment.percentage", "endpoint": "/expenses?include=apportionment"},
    21: {"coluna": "Início do Percurso por GPS", "origem": "gps.start", "endpoint": "/expenses?include=gps"},
    22: {"coluna": "Fim do Percurso por GPS", "origem": "gps.end", "endpoint": "/expenses?include=gps"},
    23: {"coluna": "Valor do KM", "origem": "expenses.mileage_value", "endpoint": "/expenses"},
    24: {"coluna": "Kilômetros Percorridos", "origem": "expenses.mileage", "endpoint": "/expenses"},
    25: {"coluna": "Moeda do Relatório", "origem": "expenses.original_currency_iso", "endpoint": "/expenses"},
    26: {"coluna": "Valor", "origem": "expenses.value", "endpoint": "/expenses"},
    
    # Coluna calculada
    27: {"coluna": "MÊS", "origem": "CALCULADO (extraído de expenses.date)", "endpoint": "N/A"},
    
    # Colunas adicionais
    28: {"coluna": "CPF", "origem": "user.cpf", "endpoint": "/expenses?include=user"},
    29: {"coluna": "Coluna1", "origem": "DESCONHECIDO", "endpoint": "N/A"},
    30: {"coluna": "colaborador", "origem": "user.name", "endpoint": "/expenses?include=user"},
}

def imprimir_mapeamento():
    """Imprime o mapeamento de forma organizada"""
    print("🔍 MAPEAMENTO COLUNAS BASE PREST -> API VEXPENSES")
    print("=" * 80)
    
    print("\n📋 COLUNAS DA API (30 colunas):")
    print("-" * 80)
    
    includes_necessarios = set()
    
    for col_idx in sorted(mapeamento.keys()):
        info = mapeamento[col_idx]
        if info["origem"] != "CALCULADO" and info["origem"] != "DESCONHECIDO":
            print(f"   {col_idx:2}. {info['coluna']:30} → {info['origem']:40}")
            if "include=" in info["endpoint"]:
                # Extrair includes
                includes = info["endpoint"].split("include=")[1].split("&")[0].split(",")
                includes_necessarios.update(includes)
    
    print(f"\n📊 COLUNA CALCULADA (1 coluna):")
    print("-" * 80)
    for col_idx in sorted(mapeamento.keys()):
        info = mapeamento[col_idx]
        if info["origem"] == "CALCULADO":
            print(f"   {col_idx:2}. {info['coluna']:30} → {info['origem']}")
    
    print(f"\n❓ COLUNA DESCONHECIDA (1 coluna):")
    print("-" * 80)
    for col_idx in sorted(mapeamento.keys()):
        info = mapeamento[col_idx]
        if info["origem"] == "DESCONHECIDO":
            print(f"   {col_idx:2}. {info['coluna']:30} → {info['origem']}")
    
    print(f"\n🔗 INCLUDES NECESSÁRIOS:")
    print("-" * 80)
    for inc in sorted(includes_necessarios):
        print(f"   - {inc}")
    
    print(f"\n📌 ENDPOINT SUGERIDO:")
    endpoint_completo = "/expenses?include=" + ",".join(sorted(includes_necessarios))
    print(f"   {endpoint_completo}")
    
    return mapeamento

if __name__ == "__main__":
    imprimir_mapeamento()
