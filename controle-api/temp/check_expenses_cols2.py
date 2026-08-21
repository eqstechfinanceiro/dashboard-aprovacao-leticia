import sqlite3
conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Amostra de detalhes1 vs expenses
rows = conn.execute("""
    SELECT d.id_da_despesa, d.nome_do_relatório, d.data, d.cpf_cnpj, d.descrição_da_despesa,
           d.reembolsável, d.anotação_da_despesa, d.centro_de_custos, d.projeto, d.percentual_de_projeto, d.mês
    FROM controle_detalhes1 d
    WHERE d.id_da_despesa IS NOT NULL
    LIMIT 3
""").fetchall()

for r in rows:
    eid = int(float(r['id_da_despesa']))
    exp = conn.execute("SELECT * FROM expenses WHERE id=?", (eid,)).fetchone()
    print(f"=== Despesa {eid} ===")
    print(f"  nome_relat (plan): {r['nome_do_relatório']!r}")
    print(f"  data (plan):       {r['data']!r}  |  expenses.data: {exp['data'] if exp else '—'!r}")
    print(f"  cpf_cnpj (plan):   {r['cpf_cnpj']!r}  |  expenses (sem campo direto)")
    print(f"  descrição (plan):  {r['descrição_da_despesa']!r}  |  expenses.description: {exp['description'][:30] if exp and exp['description'] else '—'!r}")
    print(f"  reembolsável(plan):{r['reembolsável']!r}  |  expenses.reimbursable: {exp['reimbursable'] if exp else '—'}")
    print(f"  anotação (plan):   {r['anotação_da_despesa']!r}  |  expenses.notes: {exp['notes'][:30] if exp and exp['notes'] else '—'!r}")
    print(f"  centro (plan):     {r['centro_de_custos']!r}  |  expenses.costs_center_name: {exp['costs_center_name'] if exp else '—'!r}")
    print(f"  projeto (plan):    {r['projeto']!r}  |  expenses.costs_center_description: {exp['costs_center_description'] if exp else '—'!r}")
    print(f"  pct_proj (plan):   {r['percentual_de_projeto']!r}")
    print(f"  mês (plan):        {r['mês']!r}  |  expenses.data: {exp['data'] if exp else '—'!r}")
    print()

# Verificar reports para nome_relatorio
print("=== reports table cols ===")
rcols = [r[1] for r in conn.execute('PRAGMA table_info(reports)').fetchall()]
print(rcols)
r_sample = conn.execute("SELECT * FROM reports LIMIT 1").fetchone()
if r_sample:
    print(dict(r_sample))
