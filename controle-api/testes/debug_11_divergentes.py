"""Investiga os 11 CPFs divergentes no saldo_final entre Neon snapshot e planilha ref."""
import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import openpyxl

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

# CPFs divergentes no saldo_final (da ultima execucao do calcular_quinzena_neon.py)
divs = {
    "08924586904": ("CAIO FRANCESCONI RIBEIRO",    6504.20, 0.0),
    "31040091806": ("SAULO ARAUJO DE PAULA",       0.0, 24297.43),
    "05144026958": ("CLAUDEMIR GREGOSKI RODRIG",   0.0,  9556.10),
    "04025408325": ("NILSON RODRIGUES CARDOSO",    1643.34, 6643.34),
    "01755089090": ("EVERSON ESTEVES DOS SANTO",   0.0,  4000.00),
    "01677920599": ("RAFAEL AMORIM VELLO",         None, None),  # carga_final diverge em -2000
}

cpfs = list(divs.keys())
cur.execute("""
    SELECT cpf, colaborador, saldo_prestacao, saldo_cartao, saldo_final,
           saldo_final_carga, saldo_reembolsar, saldo_cartao_carga
    FROM quinzena_controle_snapshot
    WHERE year=2026 AND month=5 AND quinzena=1 AND cpf = ANY(%s)
""", (cpfs,))

print("=== Neon snapshot 1QZ MAIO vs planilha ref ===\n")
print(f"{'CPF':<14} {'Colaborador':<28} {'SF_painel(Neon)':<16} {'SF_carga(Neon)':<15} {'SR(Neon)':<10} | ref_SF")
print("-"*100)
for r in cur.fetchall():
    cpf, colab, sp, sc, sf_painel, sf_carga, sr, scc = r
    ref_sf = divs[cpf][1] if cpf in divs else "?"
    calc_sf = divs[cpf][2] if cpf in divs else "?"
    print(f"{cpf:<14} {colab[:28]:<28} {float(sf_painel or 0):<16.2f} {float(sf_carga or 0):<15.2f} {float(sr or 0):<10.2f} | ref={ref_sf}  calc={calc_sf}")

# Ver o que a planilha ref tem para esses CPFs
print("\n=== Planilha ref 1QZ MAIO ===")
wb = openpyxl.load_workbook(BASE / "data" / "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx", read_only=True, data_only=True)
ws = wb["Planilha1"]
for row in ws.iter_rows(min_row=7, values_only=True):
    raw = row[1]
    if raw is None: continue
    cpf = str(raw).strip().replace(".","").replace("-","").zfill(11)
    if cpf in divs:
        sf   = row[8]   # SALDO FINAL
        sr   = row[7]   # SALDO REEMBOLSAR
        sc   = row[10]  # SALDO CARTAO
        qz   = row[9]   # 1QZ
        cp   = row[12]  # CARGA PARCIAL
        cf   = row[14]  # CARGA FINAL
        print(f"  {cpf} {str(row[0])[:25]:<25} SF={sf} SR={sr} SC={sc} QZ={qz} CP={cp} CF={cf}")
wb.close()
conn.close()
