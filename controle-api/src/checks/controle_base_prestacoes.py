"""
Checks de coluna para a tabela controle_base_prestacoes.
Fonte: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb → BASE PREST

Chave de junção com a API: id_da_despesa (expense.id)

NOTA: Expenses são carregados do banco SQLite (tabela expenses) para evitar instabilidade da API.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, yellow
from src.checks.shared import CpfCheck, NameCheck, ReportIdCheck, BankInfoCheck
from src.checks.shared_db import (
    ExpenseIdDBCheck, StatusDBCheck, ExpenseAmountDBCheck, 
    CurrencyDBCheck, ExpenseTypeDBCheck, PaymentMethodDBCheck
)

TABLE = "controle_base_prestacoes"

ALL_CHECKS: list[ColumnCheck] = [
    # Identificadores
    ExpenseIdDBCheck(
        table=TABLE, column="id_da_despesa", display="ID DA DESPESA",
        description="ID da despesa — via expenses.id (banco SQLite)"
    ),
    ReportIdCheck(
        table=TABLE, column="id_do_relatório", display="ID DO RELATÓRIO",
        description="ID do relatório — via reports.id"
    ),
    CpfCheck(
        table=TABLE, column="cpf_cnpj", display="CPF/CNPJ",
        description="CPF/CNPJ do colaborador — chave de junção com team-members"
    ),
    NameCheck(
        table=TABLE, column="nome_do_membro_de_equipe", display="NOME DO MEMBRO",
        description="Nome do colaborador — via team-members.name (join por CPF)",
        name_column="nome_do_membro_de_equipe"
    ),
    NameCheck(
        table=TABLE, column="colaborador", display="COLABORADOR",
        description="Nome do colaborador — via team-members.name (join por CPF)",
        name_column="colaborador"
    ),
    
    # Dados bancários
    BankInfoCheck(
        table=TABLE, column="banco", display="BANCO",
        description="Banco do método de pagamento — via payment_method.bank"
    ),
    BankInfoCheck(
        table=TABLE, column="agência", display="AGÊNCIA",
        description="Agência do método de pagamento — via payment_method.agency"
    ),
    BankInfoCheck(
        table=TABLE, column="conta", display="CONTA",
        description="Conta do método de pagamento — via payment_method.account"
    ),
    BankInfoCheck(
        table=TABLE, column="pix", display="PIX",
        description="PIX do método de pagamento — via payment_method.pix"
    ),
    
    # Status e datas (do banco SQLite)
    StatusDBCheck(
        table=TABLE, column="status", display="STATUS",
        description="Status da despesa — via report_status"
    ),
    yellow(
        table=TABLE, column="data", display="DATA",
        description="Data da despesa — via data",
        note="Campo não verificado no banco SQLite"
    ),
    yellow(
        table=TABLE, column="data_de_pagamento", display="DATA DE PAGAMENTO",
        description="Data de pagamento — via payment_date",
        note="Campo não verificado no banco SQLite"
    ),
    
    # Descrição e tipo (do banco SQLite)
    yellow(
        table=TABLE, column="descrição_da_despesa", display="DESCRIÇÃO DA DESPESA",
        description="Descrição da despesa — via description",
        note="Campo não verificado no banco SQLite"
    ),
    ExpenseTypeDBCheck(
        table=TABLE, column="tipo_de_despesa", display="TIPO DE DESPESA",
        description="Tipo de despesa — via expense_type_description"
    ),
    yellow(
        table=TABLE, column="reembolsável", display="REEMBOLSÁVEL",
        description="Se é reembolsável — via reimbursable",
        note="Campo não verificado no banco SQLite"
    ),
    
    # Anotações
    yellow(
        table=TABLE, column="anotação_da_despesa", display="ANOTAÇÃO DA DESPESA",
        description="Anotações da despesa — via notes",
        note="Campo não verificado no banco SQLite"
    ),
    yellow(
        table=TABLE, column="anotação_de_rateio", display="ANOTAÇÃO DE RATEIO",
        description="Anotações de rateio — via apportionment_notes",
        note="Campo não verificado no banco SQLite"
    ),
    
    # Centro de custos e projeto
    yellow(
        table=TABLE, column="centro_de_custos", display="CENTRO DE CUSTOS",
        description="Centro de custos — via costs_center_name",
        note="Campo não verificado no banco SQLite"
    ),
    PaymentMethodDBCheck(
        table=TABLE, column="forma_de_pagamento", display="FORMA DE PAGAMENTO",
        description="Forma de pagamento — via payment_method_name"
    ),
    yellow(
        table=TABLE, column="projeto", display="PROJETO",
        description="Nome do projeto — via project.name",
        note="Campo não verificado no banco SQLite"
    ),
    
    # GPS e KM
    yellow(
        table=TABLE, column="início_do_percurso_por_gps", display="INÍCIO DO PERCURSO",
        description="Início do percurso GPS — via gps_start",
        note="Campo não verificado no banco SQLite"
    ),
    yellow(
        table=TABLE, column="fim_do_percurso_por_gps", display="FIM DO PERCURSO",
        description="Fim do percurso GPS — via gps_end",
        note="Campo não verificado no banco SQLite"
    ),
    yellow(
        table=TABLE, column="valor_do_km", display="VALOR DO KM",
        description="Valor por KM — via km_value",
        note="Campo não verificado no banco SQLite"
    ),
    yellow(
        table=TABLE, column="kilômetros_percorridos", display="KM PERCORRIDOS",
        description="KM percorridos — via km_traveled",
        note="Campo não verificado no banco SQLite"
    ),
    
    # Valores e moeda (do banco SQLite)
    CurrencyDBCheck(
        table=TABLE, column="moeda_do_relatório", display="MOEDA",
        description="Moeda do relatório — via original_currency_iso"
    ),
    ExpenseAmountDBCheck(
        table=TABLE, column="valor", display="VALOR",
        description="Valor da despesa — via value"
    ),
    
    # Colunas não utilizadas
    yellow(
        table=TABLE, column="cpf", display="CPF (DUPLICADO)",
        description="CPF duplicado — não utilizado",
        note="Coluna duplicada, não utilizada na verificação"
    ),
    yellow(
        table=TABLE, column="coluna1", display="COLUNA1",
        description="Coluna vazia/não utilizada",
        note="Coluna vazia, não utilizada na verificação"
    ),
    yellow(
        table=TABLE, column="mês", display="MÊS",
        description="Mês da despesa — não mapeado diretamente",
        note="Campo não mapeado diretamente na API"
    ),
]
