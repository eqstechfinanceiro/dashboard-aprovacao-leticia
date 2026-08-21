#!/usr/bin/env python3
"""
DECISIVO: a aba EXTRATO/PAINEL acumula desde quando?
Compara CARGA/TRANSFERENCIA/TARIFA cacheados do PAINEL (ABNER e outros) com somas
do Neon em varias janelas, para descobrir a janela de acumulacao.
"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import openpyxl

BASE = Path(__file__).parent.parent
sys.path.insert(0, str(BASE / "src"))
from name_matcher import normalizar, NameMatcher  # noqa

load_dotenv(BASE / ".env")
CONTROLE = BASE / "data" / "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx"

# 1. valores cacheados do PAINEL: N=CARGA(13), O=TRANSF(14), P=TARIFA(15), Q=PREST(16), S=SALDOCARTAO(18), T=SALDOFINAL(19)
print("Lendo PAINEL (valores cacheados)...")
wb = openpyxl.load_workbook(CONTROLE, data_only=True, read_only=True)
wsp = wb["PAINEL"]
alvo = {}
for row in wsp.iter_rows(min_row=12, max_row=400, values_only=True):
    nome = row[1]
    if not nome:
        continue
    alvo[normalizar(str(nome))] = {
        "nome": nome, "carga": row[13], "transf": row[14], "tarifa": row[15],
        "prest": row[16], "saldo_cartao": row[18], "saldo_final": row[19],
    }
wb.close()
print(f"  {len(alvo)} colaboradores no PAINEL\n")

conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()

# usuarios distintos do Neon p/ matching de nome (Neon guarda title-case)
cur.execute("SELECT DISTINCT usuario FROM extrato_movimentacao WHERE usuario IS NOT NULL")
neon_usuarios = [r[0] for r in cur.fetchall()]
matcher = NameMatcher(neon_usuarios, threshold=0.88)

JANELAS = {
    "quinzena (26/04-10/05)": ("2026-04-26", "2026-05-10"),
    "mes maio (01-10/05)":    ("2026-05-01", "2026-05-10"),
    "ano (01/01-10/05)":      ("2026-01-01", "2026-05-10"),
    "tudo (-10/05)":          ("2000-01-01", "2026-05-10"),
}

NOMES_TESTE = ["ABNER ANDRADE CAVALCANTE", "ADAN LEONARDO SOUZA BATISTA",
               "ADEMARCIO DUARTE LOPES", "ADMILSON DOS SANTOS GALAN"]

for nome in NOMES_TESTE:
    norm = normalizar(nome)
    a = alvo.get(norm)
    print("=" * 88)
    print(f"  {nome}")
    if not a:
        print("   (nao achei no PAINEL)"); continue
    res = matcher.match(str(a["nome"]))
    usuario_neon = res.nome_match if res else None
    print(f"  PAINEL cacheado: CARGA={a['carga']} TRANSF={a['transf']} "
          f"TARIFA={a['tarifa']} PREST={a['prest']} SALDO_FINAL={a['saldo_final']}")
    print(f"  Neon usuario match: {usuario_neon!r} ({res.metodo if res else 'NAO'})")
    print("=" * 88)
    for jnome, (ini, fim) in JANELAS.items():
        cur.execute("""
            SELECT
              COALESCE(SUM(CASE WHEN tipo='Transferência' AND valor>0 THEN valor END),0),
              COALESCE(SUM(CASE WHEN tipo='Transferência' AND valor<0 THEN valor END),0),
              COALESCE(SUM(CASE WHEN tipo='Taxa' THEN valor END),0)
            FROM extrato_movimentacao
            WHERE usuario = %s AND data BETWEEN %s AND %s
        """, (usuario_neon, ini, fim))
        carga, transf, tarifa = cur.fetchone()
        print(f"   {jnome:24} | CARGA={float(carga):>11.2f} | TRANSF={float(transf):>10.2f} | TARIFA={float(tarifa):>8.2f}")
    print()

cur.close(); conn.close()
