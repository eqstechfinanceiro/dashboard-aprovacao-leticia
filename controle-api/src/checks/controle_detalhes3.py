"""
Checks de coluna para a tabela controle_detalhes3.
Fonte: CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb → Detalhes3

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
    CurrencyDBCheck, ExpenseTypeDBCheck, PaymentMethodDBCheck
)

TABLE = "controle_detalhes3"

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
    PaymentMethodDBCheck(
        table=TABLE, column="forma_de_pagamento", display="FORMA DE PAGAMENTO",
        description="Forma de pagamento — via payment_method_name"
    ),
]
