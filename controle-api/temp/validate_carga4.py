"""
Validação v4: testa fórmula completa incluindo reembolso no carga_final.
carga_parcial = 1qz - saldo_final - saldo_cartao - adiantamento  (confirmado 100%)
carga_final   = carga_parcial + reembolso  (quando positivo)
             ou reembolso - abs(carga_parcial) se carga_parcial < 0 mas carga_final > 0
"""
import sqlite3

def sf(v) -> float:
    try:
        return float(v) if v is not None and str(v).strip() not in ('', 'None') else 0.0
    except (ValueError, TypeError):
        return 0.0

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

painel = {r['cpf']: dict(r) for r in conn.execute("SELECT * FROM controle_painel").fetchall()}
sc_rows = conn.execute("SELECT cpf, valor, data FROM controle_saldo_cartao_resumo").fetchall()
saldo_cartao_map: dict = {}
saldo_cartao_data: dict = {}
for row in sc_rows:
    cpf = row['cpf']
    data_val = sf(row['data'])
    if cpf not in saldo_cartao_data or data_val > saldo_cartao_data[cpf]:
        saldo_cartao_data[cpf] = data_val
        saldo_cartao_map[cpf] = sf(row['valor'])

carga_rows = conn.execute("SELECT * FROM carga_1qz_planilha1 ORDER BY colaborador").fetchall()
TOL = 0.02

ok_cf = diff_cf = ok_sf = diff_sf = 0
anomalias = []

for row in carga_rows:
    cpf = row['cpf']
    p = painel.get(cpf)
    if not p:
        continue

    real = dict(row)
    painel_sf = sf(p.get('saldo_final'))

    saldo_final_calc = max(painel_sf, 0.0)
    saldo_reembolsar_calc = abs(painel_sf) if painel_sf < 0 else 0.0
    saldo_cartao_calc = saldo_cartao_map.get(cpf, 0.0)
    reembolso_calc = round(saldo_reembolsar_calc / 2, 10)
    col_1qz = sf(real.get('col_1ª_qz'))
    adiantamento = sf(real.get('adiantamento'))

    carga_parcial_calc = col_1qz - saldo_final_calc - saldo_cartao_calc - adiantamento

    # Fórmula carga_final: carga_parcial + reembolso (sempre), truncado em 0 se negativo
    carga_final_calc = max(carga_parcial_calc + reembolso_calc, 0.0)

    # Verificar saldo_final
    real_sf = sf(real.get('saldo_final'))
    if abs(real_sf - saldo_final_calc) <= TOL:
        ok_sf += 1
    else:
        diff_sf += 1

    # Verificar carga_final
    real_cf = sf(real.get('carga_final'))
    if abs(real_cf - carga_final_calc) <= TOL:
        ok_cf += 1
    else:
        diff_cf += 1
        anomalias.append({
            'cpf': cpf, 'nome': real['colaborador'],
            'painel_sf': painel_sf, 'real_sf': real_sf,
            'col_1qz': col_1qz, 'sc': saldo_cartao_calc,
            'sr': saldo_reembolsar_calc, 'reimb': reembolso_calc,
            'ad': adiantamento,
            'cp_calc': carga_parcial_calc,
            'cf_calc': carga_final_calc, 'cf_real': real_cf,
        })

n = len(carga_rows)
print(f"RESULTADO FINAL ({n} linhas):")
print(f"  saldo_final:  {ok_sf}/{n} OK  ({ok_sf/n*100:.1f}%)  diff={diff_sf}")
print(f"  carga_final:  {ok_cf}/{n} OK  ({ok_cf/n*100:.1f}%)  diff={diff_cf}")
print(f"\n{'='*65}")
print(f"ANOMALIAS de carga_final ({len(anomalias)}):")
for a in anomalias:
    diff = a['cf_real'] - a['cf_calc']
    print(f"\n  {a['nome']}")
    print(f"  painel_sf={a['painel_sf']:.2f} real_sf={a['real_sf']:.2f} sc={a['sc']:.2f}")
    print(f"  1qz={a['col_1qz']:.2f} ad={a['ad']:.2f} sr={a['sr']:.2f} reimb={a['reimb']:.4f}")
    print(f"  cp_calc={a['cp_calc']:.4f}  cf_calc={a['cf_calc']:.4f}  cf_real={a['cf_real']:.4f}  diff={diff:+.4f}")
