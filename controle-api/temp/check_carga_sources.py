"""
Verifica a origem concreta de cada coluna da carga_qz cruzando com as tabelas disponíveis.
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Pega um CPF de amostra
sample = conn.execute("SELECT * FROM carga_1qz_planilha1 WHERE cpf IS NOT NULL LIMIT 1").fetchone()
cpf = sample['cpf']
print(f"CPF de amostra: {cpf}\n")

# 1. colaborador / situação / regional / centro_de_custo / gestor / diretor / status_do_cartão
# → team_members via API (expenses.user_cpf, user_name)
exp = conn.execute("SELECT user_cpf, user_name FROM expenses WHERE user_cpf=? LIMIT 1", (cpf,)).fetchone()
print(f"expenses.user_name para CPF: {exp['user_name'] if exp else 'NÃO ENCONTRADO'}")
print(f"  carga.colaborador: {sample['colaborador']}")
print()

# 2. saldo_reembolsar → controle_painel ou controle_reembolso?
painel = conn.execute("SELECT * FROM controle_painel WHERE cpf=? LIMIT 1", (cpf,)).fetchone()
if painel:
    print(f"controle_painel cols: {list(dict(painel).keys())}")
    print(f"  painel values: {dict(painel)}")
else:
    print("controle_painel: CPF não encontrado")
print(f"  carga.saldo_reembolsar: {sample['saldo_reembolsar']}")
print()

# 3. saldo_final
print(f"  carga.saldo_final: {sample['saldo_final']}")
if painel:
    print(f"  painel.saldo_final (se existir): {painel['saldo_final'] if 'saldo_final' in dict(painel) else 'coluna não existe'}")
print()

# 4. saldo_cartao → controle_saldo_cartao_resumo?
sc = conn.execute("SELECT * FROM controle_saldo_cartao_resumo WHERE cpf=? LIMIT 1", (cpf,)).fetchone()
if sc:
    print(f"controle_saldo_cartao_resumo: {dict(sc)}")
else:
    # Tentar portador
    sc2 = conn.execute("SELECT * FROM controle_saldo_cartao_resumo LIMIT 1").fetchone()
    print(f"controle_saldo_cartao_resumo cols: {list(dict(sc2).keys()) if sc2 else 'vazia'}")
    print("  CPF não encontrado diretamente")
print(f"  carga.saldo_cartao: {sample['saldo_cartao']}")
print()

# 5. reembolso → controle_reembolso?
reimb = conn.execute("SELECT * FROM controle_reembolso WHERE cpf=? LIMIT 1", (cpf,)).fetchone()
if reimb:
    print(f"controle_reembolso: {dict(reimb)}")
else:
    reimb2 = conn.execute("SELECT * FROM controle_reembolso LIMIT 1").fetchone()
    print(f"controle_reembolso cols: {list(dict(reimb2).keys()) if reimb2 else 'vazia'}")
print(f"  carga.reembolso: {sample['reembolso']}")
print()

# 6. carga_parcial e carga_final — fórmulas?
print(f"  carga.carga_parcial: {sample['carga_parcial']}")
print(f"  carga.carga_final: {sample['carga_final']}")
print(f"  carga.col_1ª_qz (MANUAL): {sample['col_1ª_qz']}")
print(f"  carga.adiantamento (MANUAL): {sample['adiantamento']}")
print()

# Tentar calcular carga_parcial
try:
    saldo_final = float(sample['saldo_final'] or 0)
    col_1qz = float(sample['col_1ª_qz'] or 0)
    saldo_cartao = float(sample['saldo_cartao'] or 0)
    reembolso = float(sample['reembolso'] or 0)
    adiantamento = float(sample['adiantamento'] or 0)
    calc = col_1qz - saldo_final - saldo_cartao + reembolso - adiantamento
    print(f"  Fórmula hipótese carga_parcial = 1qz - saldo_final - saldo_cartao + reembolso - adiantamento")
    print(f"  = {col_1qz} - {saldo_final} - {saldo_cartao} + {reembolso} - {adiantamento} = {calc:.2f}")
    print(f"  Real carga_parcial: {sample['carga_parcial']}")
except Exception as e:
    print(f"  Erro ao calcular: {e}")
