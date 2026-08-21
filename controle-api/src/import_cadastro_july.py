#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
import_cadastro_july.py
=======================
Imports CONTROLE PAINEL as July 2026 QZ1 snapshot with NULL financial fields.
This serves as cadastro base for calculado mode (colaborador, situacao, etc.)
without providing any financial data that would make the validation circular.
"""
import os
import sys
from decimal import Decimal

import pyxlsb
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(ROOT)          # controle-api/
DASHBOARD = os.path.dirname(PROJECT)      # dashboard-test/
load_dotenv(os.path.join(PROJECT, ".env"))

NEON_DATABASE_URL = os.getenv("NEON_DATABASE_URL")
DATA_DIR = os.path.join(DASHBOARD, "data")
CONTROLE_PATH = os.path.join(DATA_DIR, "CONTROLE - VEXPENSES - JULHO 2026.xlsb")

PAINEL_HEADER_ROW = 11
PAINEL_DATA_START = 12
PAINEL_COLS = {
    "colaborador": 1, "cpf": 2, "situacao": 4, "status_cartao": 5,
    "regional": 8, "centro_custo": 9, "gestor": 10, "diretor": 11,
}


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


def get_cell(row_values, col_idx):
    if col_idx is None:
        return None
    return row_values[col_idx] if col_idx < len(row_values) else None


def main():
    print("Importing CONTROLE PAINEL as July 2026 QZ1 (cadastro only)...")

    if not os.path.exists(CONTROLE_PATH):
        print(f"ERRO: CONTROLE not found: {CONTROLE_PATH}")
        sys.exit(1)

    records = []
    with pyxlsb.open_workbook(CONTROLE_PATH) as wb:
        with wb.get_sheet("PAINEL") as ws:
            for i, row in enumerate(ws.rows()):
                row_num = i + 1
                if row_num < PAINEL_DATA_START:
                    continue
                vals = [c.v for c in row]
                cpf = normalize_cpf(get_cell(vals, PAINEL_COLS["cpf"]))
                if not cpf:
                    continue
                records.append({
                    "year": 2026, "month": 7, "quinzena": 1,
                    "cpf": cpf,
                    "colaborador": str(get_cell(vals, PAINEL_COLS["colaborador"]) or "").strip() or None,
                    "situacao": str(get_cell(vals, PAINEL_COLS["situacao"]) or "").strip() or None,
                    "status_cartao": str(get_cell(vals, PAINEL_COLS["status_cartao"]) or "").strip() or None,
                    "regional": str(get_cell(vals, PAINEL_COLS["regional"]) or "").strip() or None,
                    "centro_custo": str(get_cell(vals, PAINEL_COLS["centro_custo"]) or "").strip() or None,
                    "gestor": str(get_cell(vals, PAINEL_COLS["gestor"]) or "").strip() or None,
                    "diretor": str(get_cell(vals, PAINEL_COLS["diretor"]) or "").strip() or None,
                    # All financial fields = NULL (cadastro only)
                    "saldo_prestacao": None,
                    "saldo_cartao": None,
                    "saldo_final": None,
                    "col_qz": None,
                    "saldo_reembolsar": None,
                    "saldo_final_carga": None,
                    "saldo_cartao_carga": None,
                    "import_source": "CONTROLE-JULHO-2026-cadastro-only",
                })

    print(f"  Read {len(records)} colaboradores from CONTROLE PAINEL")

    if not NEON_DATABASE_URL:
        print("ERRO: NEON_DATABASE_URL nao configurada")
        sys.exit(1)

    conn = psycopg2.connect(NEON_DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # First delete any existing July 2026 snapshots
    cur.execute("DELETE FROM quinzena_controle_snapshot WHERE year = 2026 AND month = 7")
    print(f"  Deleted {cur.rowcount} existing July 2026 rows")

    upsert_sql = """
        INSERT INTO quinzena_controle_snapshot
          (year, month, quinzena, cpf,
           colaborador, situacao, status_cartao,
           regional, centro_custo, gestor, diretor,
           saldo_prestacao, saldo_cartao, saldo_final,
           col_qz, saldo_reembolsar, saldo_final_carga, saldo_cartao_carga,
           import_source, imported_at)
        VALUES
          (%(year)s, %(month)s, %(quinzena)s, %(cpf)s,
           %(colaborador)s, %(situacao)s, %(status_cartao)s,
           %(regional)s, %(centro_custo)s, %(gestor)s, %(diretor)s,
           %(saldo_prestacao)s, %(saldo_cartao)s, %(saldo_final)s,
           %(col_qz)s, %(saldo_reembolsar)s, %(saldo_final_carga)s, %(saldo_cartao_carga)s,
           %(import_source)s, NOW())
        ON CONFLICT ON CONSTRAINT uq_snapshot
        DO UPDATE SET
          colaborador = EXCLUDED.colaborador,
          situacao = EXCLUDED.situacao,
          status_cartao = EXCLUDED.status_cartao,
          regional = EXCLUDED.regional,
          centro_custo = EXCLUDED.centro_custo,
          gestor = EXCLUDED.gestor,
          diretor = EXCLUDED.diretor,
          saldo_prestacao = EXCLUDED.saldo_prestacao,
          saldo_cartao = EXCLUDED.saldo_cartao,
          saldo_final = EXCLUDED.saldo_final,
          col_qz = EXCLUDED.col_qz,
          saldo_reembolsar = EXCLUDED.saldo_reembolsar,
          saldo_final_carga = EXCLUDED.saldo_final_carga,
          saldo_cartao_carga = EXCLUDED.saldo_cartao_carga,
          import_source = EXCLUDED.import_source,
          imported_at = NOW()
    """

    try:
        psycopg2.extras.execute_batch(cur, upsert_sql, records, page_size=100)
        conn.commit()
        print(f"  ✓ Imported {len(records)} cadastro-only rows for July 2026 QZ1")
    except Exception as e:
        conn.rollback()
        print(f"  ✗ ERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
