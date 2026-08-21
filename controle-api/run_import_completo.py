"""Reimporta maio 2026 QZ1 e QZ2 com dados das planilhas de Carga."""
import sys, os, warnings
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))
from import_to_neon import import_to_neon

DATA = os.path.join(os.path.dirname(__file__), "data")

CONTROLE = os.path.join(DATA, "CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx")
CARGA1   = os.path.join(DATA, "CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx")
CARGA2   = os.path.join(DATA, "CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx")

print("=== 1a QZ MAIO 2026 (dry-run) ===")
s = import_to_neon(CONTROLE, CARGA1, year=2026, month=5, quinzena=1, dry_run=True)

print("\n=== 2a QZ MAIO 2026 (dry-run) ===")
s = import_to_neon(CONTROLE, CARGA2, year=2026, month=5, quinzena=2, dry_run=True)

confirm = input("\nGravar no Neon? (s/N) ").strip().lower()
if confirm == "s":
    print("\n=== GRAVANDO 1a QZ ===")
    s1 = import_to_neon(CONTROLE, CARGA1, year=2026, month=5, quinzena=1, dry_run=False)
    print("\n=== GRAVANDO 2a QZ ===")
    s2 = import_to_neon(CONTROLE, CARGA2, year=2026, month=5, quinzena=2, dry_run=False)
    print(f"\nTotal: QZ1={s1['rows_imported']}, QZ2={s2['rows_imported']}")
else:
    print("Cancelado.")
