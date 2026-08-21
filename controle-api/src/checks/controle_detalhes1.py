"""
Checks de coluna para a tabela controle_detalhes1.
Fonte: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb → Detalhes1

Chave de junção com a API: CPF (coluna 'cpf' no SQLite)

NOTA: Expenses são carregados do banco SQLite (tabela expenses) para evitar instabilidade da API.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from src.checks.base import ColumnCheck, yellow
from src.checks.shared import CpfCheck, NameCheck, ReportIdCheck, BankInfoCheck
from src.checks.shared_db import (
    ExpenseIdDBCheck, StatusDBCheck, ExpenseAmountDBCheck,
    CurrencyDBCheck, ExpenseTypeDBCheck, PaymentMethodDBCheck,
    ReportNameDBCheck, ExpenseDateDBCheck, ReimbursableDBCheck,
    CostsCenterDBCheck, MonthDBCheck,
)

TABLE = "controle_detalhes1"

ALL_CHECKS: list[ColumnCheck] = [
    # Identificadores
    CpfCheck(
        table=TABLE, column="cpf", display="CPF",
        description="CPF do colaborador — chave de junção com team-members"
    ),
    NameCheck(
        table=TABLE, column="nome_do_membro_de_equipe", display="NOME DO MEMBRO",
        description="Nome do colaborador — via team-members.name (join por CPF)",
        name_column="nome_do_membro_de_equipe"
    ),
    ReportIdCheck(
        table=TABLE, column="id_do_relatório", display="ID DO RELATÓRIO",
        description="ID do relatório — via reports.id"
    ),
    ExpenseIdDBCheck(
        table=TABLE, column="id_da_despesa", display="ID DA DESPESA",
        description="ID da despesa — via expenses.id (banco SQLite)"
    ),
    
    # Dados bancários
    BankInfoCheck(
        table=TABLE, column="banco", display="BANCO",
        description="Banco do colaborador — via user.bank"
    ),
    BankInfoCheck(
        table=TABLE, column="agência", display="AGÊNCIA",
        description="Agência bancária — via user.agency"
    ),
    BankInfoCheck(
        table=TABLE, column="conta", display="CONTA",
        description="Número da conta — via user.account"
    ),
    BankInfoCheck(
        table=TABLE, column="pix", display="PIX",
        description="Chave PIX — via user.pix_key"
    ),
    
    # Dados da despesa (do banco SQLite)
    ExpenseTypeDBCheck(
        table=TABLE, column="tipo_de_despesa", display="TIPO DE DESPESA",
        description="Tipo de despesa — via expense_type_description"
    ),
    StatusDBCheck(
        table=TABLE, column="status", display="STATUS",
        description="Status da despesa — via report_status"
    ),
    ExpenseAmountDBCheck(
        table=TABLE, column="valor", display="VALOR",
        description="Valor da despesa — via value"
    ),
    CurrencyDBCheck(
        table=TABLE, column="moeda_do_relatório", display="MOEDA DO RELATÓRIO",
        description="Moeda da despesa — via original_currency_iso"
    ),

    # Campos adicionais da despesa
    ReportNameDBCheck(
        table=TABLE, column="nome_do_relatório", display="NOME DO RELATÓRIO",
        description="Nome do relatório — via expenses.report_id"
    ),
    ExpenseDateDBCheck(
        table=TABLE, column="data", display="DATA",
        description="Data da despesa — via expenses.data"
    ),
    ReimbursableDBCheck(
        table=TABLE, column="reembolsável", display="REEMBOLSÁVEL",
        description="Reembolsável — via expenses.reimbursable (0=Não, 1=Sim)"
    ),
    CostsCenterDBCheck(
        table=TABLE, column="centro_de_custos", display="CENTRO DE CUSTOS",
        description="Centro de custos — via expenses.costs_center_name"
    ),
    PaymentMethodDBCheck(
        table=TABLE, column="forma_de_pagamento", display="FORMA DE PAGAMENTO",
        description="Forma de pagamento — via expenses.payment_method_name"
    ),
    MonthDBCheck(
        table=TABLE, column="mês", display="MÊS",
        description="Mês derivado de expenses.data"
    ),

    # Campos sem coluna direta no banco SQLite atual
    yellow(TABLE, "cpf_cnpj", "CPF/CNPJ", "CPF/CNPJ do estabelecimento",
           "Não disponível como coluna direta em expenses no banco SQLite"),
    yellow(TABLE, "descrição_da_despesa", "DESCRIÇÃO DA DESPESA", "Descrição livre da despesa",
           "expenses.description não foi baixado neste snapshot do banco"),
    yellow(TABLE, "anotação_da_despesa", "ANOTAÇÃO DA DESPESA", "Anotação da despesa",
           "expenses.notes não foi baixado neste snapshot do banco"),
    yellow(TABLE, "projeto", "PROJETO", "Projeto da despesa",
           "expenses.costs_center_description vazio no banco; origem a confirmar"),
    yellow(TABLE, "percentual_de_projeto", "PERCENTUAL DE PROJETO", "Percentual de rateio no projeto",
           "Campo não disponível diretamente em expenses no banco SQLite"),
]
