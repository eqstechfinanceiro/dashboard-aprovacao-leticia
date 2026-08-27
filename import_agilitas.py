"""Parse webhook responses file, deduplicate, complete via TOTVS API, and batch insert."""

import re
import sys
import os
import json
import requests
import psycopg2
from datetime import datetime
from collections import defaultdict

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Suppress SSL warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ── Config ──────────────────────────────────────────────────────────────
DB_CONN = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
TOTVS_API_BASE_URL = "https://totvs.eqsengenharia.com.br:8880"
TOTVS_API_TOKEN_URL = f"{TOTVS_API_BASE_URL}/app-root/servicos/api/oauth2/v1/token"
TOTVS_API_QUERY_URL = f"{TOTVS_API_BASE_URL}/app-root/servicos/api/framework/v1/genericQuery"
TOTVS_API_TENANT_ID = "02,02"
TOTVS_USER = "bot.contabil"
TOTVS_PASS = "EQSeng4292@"
WEBHOOK_FILE = r"C:\Users\italo.medrado\Desktop\Webhook... respostas.txt"

# Date mapping: "Ontem" = 26/08/2026 (file was from yesterday), other dates as DD/MM/YYYY
# Today is 27/08/2026, so "Ontem" = 26/08/2026
DATE_MAP = {
    "Ontem": "2026-08-26",
    "24/08": "2026-08-24",
    "20/08": "2026-08-20",
    "13/08": "2026-08-13",
    "12/08": "2026-08-12",
    "11/08": "2026-08-11",
    "10/08": "2026-08-10",
}


def parse_webhook_file(filepath):
    """Parse the webhook file and extract all report entries."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    entries = []
    current_date = None

    # Split into blocks by "Webhook" header lines
    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Detect date headers: "Ontem" or "Ontem, HH:MM" or "DD/MM"
        date_matched = False
        for date_key in DATE_MAP:
            if line == date_key or line.startswith(date_key + ","):
                current_date = DATE_MAP[date_key]
                date_matched = True
                break
        if date_matched:
            i += 1
            continue

        # Detect "Webhook Bot respostas" or "Webhook... respostas" headers
        if line.startswith("Webhook"):
            i += 1
            # Next non-empty line might be a date
            while i < len(lines) and not lines[i].strip():
                i += 1
            if i < len(lines):
                next_line = lines[i].strip()
                for date_key in DATE_MAP:
                    if next_line == date_key or next_line.startswith(date_key + ","):
                        current_date = DATE_MAP[date_key]
                        i += 1
                        break
            continue

        # Parse entry lines (✅ or ...de Contas)
        if line.startswith("✅") or ("de Contas Finalizada" in line and "ID" in line):
            entry = parse_entry_line(line, current_date)
            if entry:
                entries.append(entry)

        i += 1

    return entries


def parse_entry_line(line, date_str):
    """Extract ID, usuario, itens, valor from a webhook entry line."""
    entry = {
        "id": None,
        "usuario": None,
        "itens_count": None,
        "itens_detail": None,
        "valor": None,
        "data": date_str,
        "notas": [],
        "complete": False,
    }

    # Extract ID: "ID XXXXX" or "ID: XXXXX"
    m = re.search(r"ID[:\s]+(\d+)", line)
    if m:
        entry["id"] = m.group(1)
    else:
        return None

    # Extract Usuário: "Usuário XXXXX" or "Usuário: XXXXX"
    m = re.search(r"Usu[aá]rio[:\s]+(\d+)", line)
    if m:
        entry["usuario"] = m.group(1)

    # Extract Itens: "Itens N (X NOTA, Y RECIBO)" or "Itens N (N..."
    m = re.search(r"Itens[:\s]+(\d+)\s*\(([^)]*)\)", line)
    if m:
        entry["itens_count"] = int(m.group(1))
        entry["itens_detail"] = m.group(2)
    else:
        m = re.search(r"Itens[:\s]+(\d+)", line)
        if m:
            entry["itens_count"] = int(m.group(1))

    # Extract Valor Total: "Valor Total R$ X.XXX,XX" or "Valor...R$ X.XXX,XX"
    m = re.search(r"Valor\s*(?:Total)?\s*R\$\s*([\d.,]+)", line)
    if m:
        valor_str = m.group(1).replace(".", "").replace(",", ".")
        try:
            entry["valor"] = float(valor_str)
        except ValueError:
            pass

    # Extract individual notas: "NOTA XXXX:" or "NOTA XXXXX"
    notas = re.findall(r"NOTA\s+([\d]+):", line)
    entry["notas"] = notas

    # Check if entry is complete (has valor and itens detail)
    entry["complete"] = entry["valor"] is not None and entry["itens_detail"] is not None

    return entry


def deduplicate(entries):
    """Deduplicate by ID, keeping the most complete entry."""
    by_id = {}
    for e in entries:
        if e["id"] not in by_id:
            by_id[e["id"]] = e
        else:
            # Keep the more complete one
            existing = by_id[e["id"]]
            if e["complete"] and not existing["complete"]:
                by_id[e["id"]] = e
            elif e["complete"] and existing["complete"]:
                # Both complete, keep the one with more notas info
                if len(e["notas"]) > len(existing["notas"]):
                    by_id[e["id"]] = e
    return list(by_id.values())


# ── TOTVS API ───────────────────────────────────────────────────────────

class TotvsAPI:
    def __init__(self):
        self.session = requests.Session()
        self.token = None

    def authenticate(self):
        # Get session cookie
        self.session.get(f"{TOTVS_API_BASE_URL}/app-root/servicos/", verify=False, timeout=30)
        # Request token
        resp = self.session.post(
            TOTVS_API_TOKEN_URL,
            data={"grant_type": "password", "username": TOTVS_USER, "password": TOTVS_PASS},
            headers={"Accept": "application/json"},
            verify=False,
            timeout=30,
        )
        if resp.status_code in (200, 201):
            self.token = resp.json().get("access_token")
            print(f"  TOTVS API authenticated, token valid")
            return True
        print(f"  TOTVS API auth failed: HTTP {resp.status_code}: {resp.text[:200]}")
        return False

    def get_report_items(self, report_id):
        """Get all items for a report from Z01 table."""
        if not self.token:
            if not self.authenticate():
                return []

        from urllib.parse import urlencode
        where = f"Z01.D_E_L_E_T_=' ' AND Z01.Z01_IDAGIL='{report_id}'"
        fields = ("Z01_IDAGIL,Z01_STATUS,Z01_DTEMIS,Z01_TIPDOC,Z01_NUMDOC,"
                  "Z01_VALOR,Z01_IDUSER,Z01_MEIPAG,Z01_DOC,Z01_SERIE")

        all_items = []
        page = 1
        while page <= 100:
            params = {
                "tables": "Z01", "fields": fields, "where": where,
                "page": str(page), "pageSize": "100",
            }
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "tenantId": TOTVS_API_TENANT_ID,
            }
            url = f"{TOTVS_API_QUERY_URL}?{urlencode(params)}"
            resp = self.session.get(url, headers=headers, verify=False, timeout=60)
            if resp.status_code != 200:
                print(f"    Query failed for {report_id}: HTTP {resp.status_code}")
                break
            data = resp.json()
            items = data.get("items", [])
            all_items.extend(items)
            if not data.get("hasNext"):
                break
            page += 1

        return all_items


def complete_from_api(entries, api):
    """Fill in missing data (valor, itens) from TOTVS API."""
    incomplete = [e for e in entries if not e["complete"]]
    print(f"\n  {len(incomplete)} entries need API completion")

    for i, entry in enumerate(incomplete):
        print(f"  [{i+1}/{len(incomplete)}] Fetching report {entry['id']}...", end=" ", flush=True)
        items = api.get_report_items(entry["id"])

        if not items:
            print("NO ITEMS FOUND")
            continue

        # Calculate total valor
        total = sum(float(item.get("z01_valor", 0) or 0) for item in items)
        entry["valor"] = total

        # Count items by type
        notas = [item for item in items if item.get("z01_tipdoc", "").upper() == "N"]
        recibos = [item for item in items if item.get("z01_tipdoc", "").upper() == "R"]
        entry["itens_count"] = len(items)
        entry["itens_detail"] = f"{len(notas)} NOTA, {len(recibos)} RECIBO"

        # Get user ID if missing
        if not entry["usuario"] and items:
            entry["usuario"] = items[0].get("z01_iduser", "")

        # Get emission date if no date
        if not entry["data"] and items:
            dtemis = items[0].get("z01_dtemis", "")
            if dtemis:
                # API returns YYYY-MM-DD
                entry["data"] = dtemis[:10]

        entry["complete"] = True
        print(f"OK - {len(items)} items, R$ {total:.2f}")

    return entries


def batch_insert(entries):
    """Insert entries into resultados_notas."""
    conn = psycopg2.connect(DB_CONN)
    cur = conn.cursor()

    # Check which IDs already exist
    existing_ids = set()
    for e in entries:
        cur.execute("SELECT id FROM resultados_notas WHERE numero_nota = %s AND fonte = 'protheus-reports-vex'", (e["id"],))
        if cur.fetchone():
            existing_ids.add(e["id"])

    new_entries = [e for e in entries if e["id"] not in existing_ids]
    skipped = len(entries) - len(new_entries)
    print(f"\n  {skipped} entries already exist, {len(new_entries)} to insert")

    if not new_entries:
        print("  Nothing to insert.")
        cur.close()
        conn.close()
        return 0

    # Build batch insert
    values = []
    params = []
    for e in new_entries:
        if not e["valor"] or not e["data"]:
            print(f"  SKIP id={e['id']} - missing valor or data")
            continue

        item_count = e["itens_count"] or 0
        titulo = f"Report {e['id']} — {item_count} item(s) — R$ {e['valor']:.2f}"
        hora = datetime.now().strftime("%H:%M:%S")

        values.append("(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)")
        params.extend([
            titulo,                    # titulo
            "agilitas",                # tipo
            e["valor"],                # valor
            0,                         # tempo_segundos
            True,                      # feita_pelo_bot
            e["data"],                 # data
            hora,                      # hora
            "protheus-reports-vex",    # fonte
            "EQS",                     # empresa
            None,                      # usuario
            None,                      # fornecedor_codigo
            None,                      # fornecedor_nome
            e["id"],                   # numero_nota
            None,                      # especie_doc
            2,                         # filial
        ])

    if not values:
        print("  No valid entries to insert.")
        cur.close()
        conn.close()
        return 0

    # Insert in batches of 50
    inserted = 0
    for i in range(0, len(values), 50):
        batch_v = values[i:i+50]
        batch_p = params[i*15:(i+50)*15]
        query = f"""
            INSERT INTO resultados_notas 
            (titulo, tipo, valor, tempo_segundos, feita_pelo_bot, data, hora, 
             fonte, empresa, usuario, fornecedor_codigo, fornecedor_nome, 
             numero_nota, especie_doc, filial)
            VALUES {','.join(batch_v)}
        """
        cur.execute(query, batch_p)
        inserted += cur.rowcount

    conn.commit()
    print(f"  Inserted {inserted} entries")

    # Verify
    cur.execute("SELECT COUNT(*) FROM resultados_notas WHERE tipo = 'agilitas'")
    total = cur.fetchone()[0]
    print(f"  Total agilitas entries now: {total}")

    cur.close()
    conn.close()
    return inserted


# ── Main ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  Agilitas Webhook Import")
    print("=" * 60)

    # 1. Parse webhook file
    print("\n1. Parsing webhook file...")
    entries = parse_webhook_file(WEBHOOK_FILE)
    print(f"  Parsed {len(entries)} entries")
    complete = sum(1 for e in entries if e["complete"])
    incomplete = len(entries) - complete
    print(f"  Complete: {complete}, Incomplete: {incomplete}")

    # 2. Deduplicate
    print("\n2. Deduplicating...")
    entries = deduplicate(entries)
    print(f"  {len(entries)} unique entries after dedup")
    complete = sum(1 for e in entries if e["complete"])
    incomplete = len(entries) - complete
    print(f"  Complete: {complete}, Incomplete: {incomplete}")

    # Show sample
    for e in entries[:5]:
        print(f"  id={e['id']} usuario={e['usuario']} itens={e['itens_count']} valor={e['valor']} data={e['data']} complete={e['complete']}")

    # 3. Complete missing data via TOTVS API
    if incomplete > 0:
        print("\n3. Completing missing data via TOTVS API...")
        api = TotvsAPI()
        if api.authenticate():
            entries = complete_from_api(entries, api)
        else:
            print("  WARNING: Could not authenticate to TOTVS API, incomplete entries will be skipped")
    else:
        print("\n3. No incomplete entries, skipping API completion")

    # 4. Batch insert
    print("\n4. Batch insert into database...")
    inserted = batch_insert(entries)

    print(f"\n{'=' * 60}")
    print(f"  Done! {inserted} new entries inserted")
    print(f"{'=' * 60}")
