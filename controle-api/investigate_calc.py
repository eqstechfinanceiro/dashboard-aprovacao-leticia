#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
investigate_calc.py
===================
Investigates discrepancies between calculado mode and sheets.
Checks: saldo_cartao, saldo_reembolsar, and prestacao data.
"""
import os
import json
import openpyxl
from decimal import Decimal

ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
DATA_DIR = os.path.join(ROOT, 'data')
API_JSON = os.path.join(ROOT, 'api_all_quinzenas.json')

CARGA_FILE = os.path.join(DATA_DIR, "01 - JANEIRO", "1QZ JANEIRO 2026 - VEXPENSES.xlsx")
SHEET_NAME = "1 QZ VEXPENSES 01_2026"
HEADER_ROW = 6
DATA_START = 7
COLS = {"cpf": 2, "colaborador": 1, "saldo_final_carga": 9, "col_qz": 10,
        "saldo_cartao_carga": 11, "adiantamento": 12, "saldo_reembolsar": 8,
        "carga_final": 16}


def normalize_cpf(raw):
    if raw is None:
        return None
    s = str(raw).strip().replace(".", "").replace("-", "").replace("/", "").replace(" ", "")
    if "." in s:
        try:
            s = str(int(float(s)))
        except (ValueError, TypeError):
            pass
    return s.zfill(11) if s.isdigit() and len(s) <= 11 else None


def to_num(v):
    if v is None:
        return 0
    try:
        return float(Decimal(str(v)))
    except:
        return 0


def main():
    # Load API data for Jan QZ1
    with open(API_JSON, 'r', encoding='utf-8') as f:
        api_all = json.load(f)
    api_data = api_all['1_1']['data']
    api_by_cpf = {r['cpf']: r for r in api_data}

    # Read sheet
    wb = openpyxl.load_workbook(CARGA_FILE, data_only=True, read_only=True)
    ws = wb[SHEET_NAME]

    sheet_rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        row_num = i + 1
        if row_num < DATA_START:
            continue
        cpf = normalize_cpf(row[COLS["cpf"]] if COLS["cpf"] < len(row) else None)
        if not cpf:
            continue
        sheet_rows.append({
            "cpf": cpf,
            "colaborador": str(row[COLS["colaborador"]] or "").strip() if COLS["colaborador"] < len(row) else "",
            "saldo_final_sheet": to_num(row[COLS["saldo_final_carga"]] if COLS["saldo_final_carga"] < len(row) else None),
            "col_qz_sheet": to_num(row[COLS["col_qz"]] if COLS["col_qz"] < len(row) else None),
            "saldo_cartao_sheet": to_num(row[COLS["saldo_cartao_carga"]] if COLS["saldo_cartao_carga"] < len(row) else None),
            "saldo_reembolsar_sheet": to_num(row[COLS["saldo_reembolsar"]] if COLS["saldo_reembolsar"] and COLS["saldo_reembolsar"] < len(row) else None),
            "adiantamento_sheet": to_num(row[COLS["adiantamento"]] if COLS["adiantamento"] < len(row) else None),
            "carga_final_sheet": to_num(row[COLS["carga_final"]] if COLS["carga_final"] < len(row) else None),
        })
    wb.close()

    # Skip duplicate rows (same CPF)
    seen = set()
    unique_rows = []
    for r in sheet_rows:
        if r["cpf"] not in seen:
            seen.add(r["cpf"])
            unique_rows.append(r)

    print(f"Sheet rows: {len(unique_rows)}")
    print(f"API rows: {len(api_data)}")

    # Compare
    matched = 0
    sc_nonzero_sheet_api_zero = 0
    sc_both_zero = 0
    sc_both_nonzero = 0
    sc_mismatch = 0
    sr_mismatch = 0
    sf_match_sc_mismatch = 0

    examples_sc_mismatch = []
    examples_sr_mismatch = []

    for s in unique_rows:
        api = api_by_cpf.get(s["cpf"])
        if not api:
            continue
        matched += 1

        sc_api = round(api.get("saldo_cartao_carga", 0) or 0, 2)
        sc_sheet = round(s["saldo_cartao_sheet"], 2)
        sr_api = round(api.get("saldo_reembolsar", 0) or 0, 2)
        sr_sheet = round(s["saldo_reembolsar_sheet"], 2)
        sf_api = round(api.get("saldo_final_carga", 0) or 0, 2)
        sf_sheet = round(s["saldo_final_sheet"], 2)

        if sc_sheet != 0 and sc_api == 0:
            sc_nonzero_sheet_api_zero += 1
        elif sc_sheet == 0 and sc_api == 0:
            sc_both_zero += 1
        elif sc_sheet != 0 and sc_api != 0:
            sc_both_nonzero += 1
            if abs(sc_api - sc_sheet) > 0.5:
                sc_mismatch += 1
                if len(examples_sc_mismatch) < 10:
                    examples_sc_mismatch.append({
                        "cpf": s["cpf"], "name": s["colaborador"],
                        "sc_api": sc_api, "sc_sheet": sc_sheet,
                        "sf_api": sf_api, "sf_sheet": sf_sheet
                    })

        if abs(sr_api - sr_sheet) > 0.5:
            sr_mismatch += 1
            if len(examples_sr_mismatch) < 10:
                examples_sr_mismatch.append({
                    "cpf": s["cpf"], "name": s["colaborador"],
                    "sr_api": sr_api, "sr_sheet": sr_sheet,
                    "sf_api": sf_api, "sf_sheet": sf_sheet,
                    "sc_api": sc_api, "sc_sheet": sc_sheet
                })

        if abs(sf_api - sf_sheet) <= 0.5 and abs(sc_api - sc_sheet) > 0.5:
            sf_match_sc_mismatch += 1

    print(f"\nCompared: {matched}")
    print(f"\n=== SALDO CARTAO ===")
    print(f"  Both zero: {sc_both_zero}")
    print(f"  Sheet non-zero, API zero: {sc_nonzero_sheet_api_zero}")
    print(f"  Both non-zero: {sc_both_nonzero}")
    print(f"  Both non-zero but mismatch: {sc_mismatch}")
    print(f"\n=== SALDO REEMBOLSAR ===")
    print(f"  Mismatch: {sr_mismatch}")
    print(f"\n=== SF matches but SC doesn't: {sf_match_sc_mismatch}")

    print(f"\n=== EXAMPLES: SC mismatch (both non-zero) ===")
    for e in examples_sc_mismatch:
        print(f"  {e['name'][:25]:25} CPF={e['cpf']} | SC: api={e['sc_api']:10.2f} sheet={e['sc_sheet']:10.2f} d={e['sc_api']-e['sc_sheet']:10.2f} | SF: api={e['sf_api']:10.2f} sheet={e['sf_sheet']:10.2f}")

    print(f"\n=== EXAMPLES: SR mismatch ===")
    for e in examples_sr_mismatch:
        print(f"  {e['name'][:25]:25} CPF={e['cpf']} | SR: api={e['sr_api']:10.2f} sheet={e['sr_sheet']:10.2f} d={e['sr_api']-e['sr_sheet']:10.2f} | SF: api={e['sf_api']:10.2f} sheet={e['sf_sheet']:10.2f} | SC: api={e['sc_api']:10.2f} sheet={e['sc_sheet']:10.2f}")


if __name__ == "__main__":
    main()
