"""Check status history and approval dates of gap reports to confirm timing issue."""
import os, json, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# The report IDs from the user's list
gap_report_ids = [
    10372756, 9823077, 9823071, 9366952, 11081495, 11080905, 11081343,
    11081001, 11080309, 11080145, 11080573, 10920785, 11080690, 11081446,
    10977210, 10917583, 10938615, 10984423,
    # Also the ones downloaded
    9695987, 10918481, 10874586, 10658622, 10793680, 10793693, 10639294,
    10794955, 10597789, 10664463, 10581502, 9792680, 9830796, 9759226,
    10912883, 10470546, 10338583, 10613695, 10816580, 10583924,
]

cur.execute("""
    SELECT id, name, status, user_name, user_cpf, created_at, updated_at,
           raw_data
    FROM prestacao_reports
    WHERE id = ANY(%s)
    ORDER BY updated_at DESC
""", (gap_report_ids,))

reports = cur.fetchall()
conn.close()

print(f"{'Report ID':>10s} | {'Status':>10s} | {'Created':>20s} | {'Updated':>20s} | {'Approval Date':>20s} | {'Name':30s} | {'User':25s} | Notes")
print("-" * 180)

for r in reports:
    raw = r["raw_data"] or {}
    if isinstance(raw, str):
        raw = json.loads(raw)
    
    approval_date = raw.get("approval_date", "") if raw else ""
    status_history = raw.get("status_history", []) if raw else []
    
    # Try to extract status history dates
    notes = []
    if status_history and isinstance(status_history, list):
        for h in status_history:
            s = h.get("status", "") if isinstance(h, dict) else str(h)
            d = h.get("date", h.get("created_at", "")) if isinstance(h, dict) else ""
            if s:
                notes.append(f"{s}@{d}")
    
    # Also check raw_data for other date fields
    created_raw = raw.get("created_at", "") if raw else ""
    sent_date = raw.get("sent_date", raw.get("enviado_date", "")) if raw else ""
    
    created_str = str(r["created_at"])[:19] if r["created_at"] else ""
    updated_str = str(r["updated_at"])[:19] if r["updated_at"] else ""
    approval_str = str(approval_date)[:19] if approval_date else ""
    
    notes_str = " | ".join(notes[:5]) if notes else ""
    if not notes_str:
        # Check if there are any date fields in raw_data
        date_fields = {k: v for k, v in raw.items() if "date" in k.lower() or "data" in k.lower() or "aprov" in k.lower() or "status" in k.lower() or "histor" in k.lower()}
        if date_fields:
            notes_str = json.dumps(date_fields, ensure_ascii=False, default=str)[:200]
    
    print(f"{r['id']:>10d} | {r['status'] or '':>10s} | {created_str:>20s} | {updated_str:>20s} | {approval_str:>20s} | {(r['name'] or '')[:30]:30s} | {(r['user_name'] or '')[:25]:25s} | {notes_str}")

print(f"\n\n--- Raw data keys for first report ---")
if reports:
    raw = reports[0]["raw_data"] or {}
    if isinstance(raw, str):
        raw = json.loads(raw)
    if raw:
        print(f"Report {reports[0]['id']} keys: {sorted(raw.keys())}")
        # Print status-related fields
        for k, v in sorted(raw.items()):
            if any(x in k.lower() for x in ["status", "date", "data", "aprov", "histor", "action", "comment"]):
                print(f"  {k}: {json.dumps(v, ensure_ascii=False, default=str)[:300]}")
