"""Consulta o progresso do download via banco Neon (não interfere no download em andamento)."""
import psycopg2
from dotenv import load_dotenv
from pathlib import Path
import os

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

NEON_URL = os.getenv("NEON_DATABASE_URL")

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor()

# Contar reports e expenses já inseridos
cur.execute("SELECT COUNT(*) FROM prestacao_reports")
reports_count = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
expenses_count = cur.fetchone()[0]

# Pegar o maior report_id inserido (para estimar progresso)
cur.execute("SELECT MAX(id) FROM prestacao_reports")
max_report_id = cur.fetchone()[0]

# Pegar o menor report_id inserido
cur.execute("SELECT MIN(id) FROM prestacao_reports")
min_report_id = cur.fetchone()[0]

cur.close()
conn.close()

print(f"=== Progresso Atual (Neon) ===")
print(f"Reports inseridos: {reports_count}")
print(f"Expenses inseridos: {expenses_count}")
print(f"Menor report_id: {min_report_id}")
print(f"Maior report_id: {max_report_id}")

if reports_count > 0:
    # Estimar tempo decorrido baseado nos reports já baixados
    tempo_decorrido = reports_count * 0.8  # 0.8s por report
    print(f"\nTempo decorrido: {tempo_decorrido / 60:.1f} minutos ({tempo_decorrido / 3600:.1f} horas)")
    
    # Estimar total baseado no range de IDs (assumindo distribuição uniforme)
    if min_report_id and max_report_id:
        range_ids = max_report_id - min_report_id
        # Assumir que o total é ~50% maior que o range já visto (estimativa conservadora)
        total_estimado = int(range_ids * 1.5)
        progress_pct = (reports_count / total_estimado) * 100
        tempo_restante = (total_estimado - reports_count) * 0.8
        print(f"Total estimado: ~{total_estimado} reports")
        print(f"Progresso estimado: {progress_pct:.1f}%")
        print(f"Tempo restante estimado: {tempo_restante / 60:.1f} minutos ({tempo_restante / 3600:.1f} horas)")
