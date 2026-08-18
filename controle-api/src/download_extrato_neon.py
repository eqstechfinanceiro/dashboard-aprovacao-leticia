#!/usr/bin/env python3
"""
download_extrato_neon.py
------------------------
Baixa o extrato completo dos cartoes via API VExpenses (v3/pay/statement/excel-all)
e grava no banco Neon (PostgreSQL), tabela `extrato_movimentacao`.

Estrategia:
  - Periodo dividido em chunks de 15 dias (limite pratico da API).
  - Para cada chunk: baixa XLSX do S3, normaliza colunas e faz REPLACE-BY-RANGE
    (DELETE das datas do chunk + INSERT) -> idempotente, pode rodar quantas vezes quiser.
  - Linhas com Tipo nulo (e Hora == '-') sao SNAPSHOTS do saldo do cartao no dia.

Colunas do XLSX (origem):
  Data, Hora, Codigo de Transacao, Numero do Cartao, Grupo, Usuario, Tipo,
  Descricao, Valor, Status, ID da Despesa, ID do Relatorio, Tipo de Despesa,
  Centro de Custo, Projeto, Percentual de projeto

Uso:
  python src/download_extrato_neon.py                       # ano todo: 01/01 -> hoje
  python src/download_extrato_neon.py --start 2026-01-01 --end 2026-06-16
  python src/download_extrato_neon.py --start 2026-06-01 --end 2026-06-16  # so atualizar junho
"""

import argparse
import json
import logging
import os
import subprocess
import time
from datetime import datetime, timedelta, date
from pathlib import Path

import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

NEON_URL = os.getenv("NEON_DATABASE_URL")

# Token Laravel (cookie capturado do browser). Substituir quando expirar.
LARAVEL_TOKEN = os.getenv("VEXPENSES_LARAVEL_TOKEN", "eyJpdiI6Ik1JN2V3a3JEeWpCTDlrZ2Z1R2Y1Q1E9PSIsInZhbHVlIjoiaHJNRUNmVHQxUGtVZDlTN0RIVXlXUFBZdXlFTWMzMldweUxDWnlLYzRIV2U1STVBa2VTL2ZIaUtQZVFOcEZFTkFJTG9GNHJSWURiWWJEME5ZU0FoRXFUcjFNZ0FyVFhMaGtyeDZHS1NvTitPSjlyeFNiZzJ2cWRvWStUNm1PbmFJWlpEUG1GWTN2RHZiNE5PYlFxc1E4eEZEQ1VDZWFlL1hNcEs5cE1BbGl2SXpPd3BKaVd0dlY3cFBJQ3ZQR0RqZjF2VGFud2lZRVkza0Q3QnJDMXpIZFJDNmJkL2JSc0NRUTEwZGhNekxsRGZZaklleXNRWnBlRG5iaVZycnI3SkVQc2YyaWlzVzFpTnIvMEJJeFpzYjltNzRiMzhSRE0xcXBoazBLa3lyM084b00vbm40OUNPU2kxNkJ3MWhoeWwiLCJtYWMiOiIzZmQwMDA3MDEzZTY0NWU5OWQ2MWE1NjcwMWRhOWVjZGIzNjU5NTc0MzM5MTNhN2E4MTg1NGY2YjE0MzNmMjA2IiwidGFnIjoiIn0=")

TEMP_DIR = BASE / "temp"
TEMP_DIR.mkdir(exist_ok=True)

# Mapa: coluna XLSX -> coluna no banco
COLUNA_MAP = {
    "Data": "data",
    "Hora": "hora",
    "Código de Transação": "codigo_transacao",
    "Número do Cartão": "numero_cartao",
    "Grupo": "grupo",
    "Usuário": "usuario",
    "Tipo": "tipo",
    "Descrição": "descricao",
    "Valor": "valor",
    "Status": "status",
    "ID da Despesa": "id_despesa",
    "ID do Relatório": "id_relatorio",
    "Tipo de Despesa": "tipo_despesa",
    "Centro de Custo": "centro_custo",
    "Projeto": "projeto",
    "Percentual de projeto": "percentual_projeto",
}

COLUNAS_DB = [
    "data", "hora", "codigo_transacao", "numero_cartao", "grupo", "usuario",
    "tipo", "descricao", "valor", "status", "id_despesa", "id_relatorio",
    "tipo_despesa", "centro_custo", "projeto", "percentual_projeto", "is_snapshot",
]


# =============================================================================
# Banco
# =============================================================================

def criar_tabela(conn) -> None:
    """Cria a tabela extrato_movimentacao e indices se nao existirem."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS extrato_movimentacao (
                id                 BIGSERIAL PRIMARY KEY,
                data               DATE,
                hora               TEXT,
                codigo_transacao   TEXT,
                numero_cartao      TEXT,
                grupo              TEXT,
                usuario            TEXT,
                tipo               TEXT,
                descricao          TEXT,
                valor              NUMERIC(14,2),
                status             TEXT,
                id_despesa         BIGINT,
                id_relatorio       BIGINT,
                tipo_despesa       TEXT,
                centro_custo       TEXT,
                projeto            TEXT,
                percentual_projeto TEXT,
                is_snapshot        BOOLEAN DEFAULT FALSE,
                created_at         TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_extrato_usuario ON extrato_movimentacao(usuario)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_extrato_data ON extrato_movimentacao(data)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_extrato_snapshot ON extrato_movimentacao(is_snapshot)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_extrato_usuario_data ON extrato_movimentacao(usuario, data)")
    conn.commit()
    logger.info("Tabela extrato_movimentacao pronta.")


def replace_range(conn, chunk_start: str, chunk_end: str, rows: list[tuple]) -> int:
    """Deleta o range de datas e insere as novas linhas (idempotente)."""
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM extrato_movimentacao WHERE data BETWEEN %s AND %s",
            (chunk_start, chunk_end),
        )
        if rows:
            psycopg2.extras.execute_values(
                cur,
                f"""INSERT INTO extrato_movimentacao
                    ({', '.join(COLUNAS_DB)})
                    VALUES %s""",
                rows,
                page_size=500,
            )
    conn.commit()
    return len(rows)


# =============================================================================
# Download + parse
# =============================================================================

def dividir_periodo(start_date: str, end_date: str, max_dias: int = 15) -> list[tuple[str, str]]:
    chunks = []
    current = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    while current <= end:
        chunk_end = min(current + timedelta(days=max_dias - 1), end)
        chunks.append((current.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")))
        current = chunk_end + timedelta(days=1)
    return chunks


def baixar_chunk(start_date: str, end_date: str, max_retries: int = 3) -> "pd.DataFrame | None":
    """Baixa o XLSX de extrato para um periodo. Retorna DataFrame ou None."""
    url = (f"https://api.vexpenses.com/v3/pay/statement/excel-all"
           f"?start_date={start_date}&end_date={end_date}")

    for attempt in range(1, max_retries + 1):
        try:
            # Passo 1: obter URL do S3
            cmd = ["curl.exe", "-s", "-X", "GET", url,
                   "-H", f"Cookie: laravel_token={LARAVEL_TOKEN}",
                   "-H", "Accept: application/json"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            if result.returncode != 0:
                logger.warning(f"  curl falhou (tentativa {attempt}): {result.stderr[:100]}")
                time.sleep(3)
                continue

            data = json.loads(result.stdout)
            if not data.get("success"):
                erro = data.get("errors", [{}])
                msg = erro[0].get("message", str(data)[:150]) if erro else str(data)[:150]
                logger.error(f"  API retornou erro: {msg}")
                return None

            s3_url = data.get("data", {}).get("url")
            if not s3_url:
                logger.error("  Sem URL de download na resposta.")
                return None

            # Passo 2: baixar XLSX
            temp_file = TEMP_DIR / f"extrato_{start_date}_{end_date}.xlsx"
            dl = subprocess.run(["curl.exe", "-s", "-L", "-o", str(temp_file), s3_url],
                                capture_output=True, timeout=180)
            if dl.returncode != 0 or not temp_file.exists():
                logger.warning(f"  Download XLSX falhou (tentativa {attempt})")
                time.sleep(3)
                continue

            # Passo 3: ler
            df = pd.read_excel(temp_file)
            try:
                temp_file.unlink()
            except PermissionError:
                pass  # arquivo ainda em uso pelo SO; sera sobrescrito depois
            return df

        except subprocess.TimeoutExpired:
            logger.warning(f"  Timeout (tentativa {attempt})")
            time.sleep(5)
        except json.JSONDecodeError:
            logger.error(f"  Resposta nao-JSON (token expirado?): {result.stdout[:150]}")
            return None
        except Exception as e:
            logger.warning(f"  Erro (tentativa {attempt}): {e}")
            time.sleep(3)

    logger.error(f"  Falha apos {max_retries} tentativas.")
    return None


def _to_str(v) -> "str | None":
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    if s in ("", "-", "nan", "NaN", "None"):
        return None
    return s


def _to_int(v) -> "int | None":
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def _to_float(v) -> float:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0.0
    try:
        return round(float(v), 2)
    except (ValueError, TypeError):
        return 0.0


def _to_date(v) -> "str | None":
    if v is None or pd.isna(v):
        return None
    try:
        return pd.to_datetime(v).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


def normalizar(df: pd.DataFrame) -> list[tuple]:
    """Converte o DataFrame em lista de tuplas prontas para INSERT."""
    # Renomeia colunas conhecidas
    rename = {c: COLUNA_MAP[c] for c in df.columns if c in COLUNA_MAP}
    df = df.rename(columns=rename)

    # Garante todas as colunas
    for col in COLUNA_MAP.values():
        if col not in df.columns:
            df[col] = None

    rows = []
    for _, r in df.iterrows():
        tipo = _to_str(r.get("tipo"))
        is_snapshot = tipo is None
        rows.append((
            _to_date(r.get("data")),
            _to_str(r.get("hora")),
            _to_str(r.get("codigo_transacao")),
            _to_str(r.get("numero_cartao")),
            _to_str(r.get("grupo")),
            _to_str(r.get("usuario")),
            tipo,
            _to_str(r.get("descricao")),
            _to_float(r.get("valor")),
            _to_str(r.get("status")),
            _to_int(r.get("id_despesa")),
            _to_int(r.get("id_relatorio")),
            _to_str(r.get("tipo_despesa")),
            _to_str(r.get("centro_custo")),
            _to_str(r.get("projeto")),
            _to_str(r.get("percentual_projeto")),
            is_snapshot,
        ))
    return rows


# =============================================================================
# Main
# =============================================================================

def baixar_extrato_completo(start_date: str, end_date: str) -> dict:
    if not NEON_URL:
        raise RuntimeError("NEON_DATABASE_URL nao configurada no .env")

    logger.info("=" * 70)
    logger.info(f"DOWNLOAD EXTRATO -> NEON | {start_date} a {end_date}")
    logger.info("=" * 70)

    conn = psycopg2.connect(NEON_URL)
    criar_tabela(conn)

    chunks = dividir_periodo(start_date, end_date, max_dias=15)
    logger.info(f"Total de chunks: {len(chunks)}")

    stats = {"chunks_ok": 0, "chunks_falha": 0, "registros": 0, "snapshots": 0, "falhas": []}

    for i, (cs, ce) in enumerate(chunks, 1):
        logger.info(f"[{i}/{len(chunks)}] {cs} a {ce}...")
        df = baixar_chunk(cs, ce)
        if df is None:
            stats["chunks_falha"] += 1
            stats["falhas"].append((cs, ce))
            continue

        rows = normalizar(df)
        n = replace_range(conn, cs, ce, rows)
        snaps = sum(1 for r in rows if r[-1])  # is_snapshot
        stats["chunks_ok"] += 1
        stats["registros"] += n
        stats["snapshots"] += snaps
        logger.info(f"  OK: {n} registros ({snaps} snapshots)")

        if i < len(chunks):
            time.sleep(2)

    # Verificacao final
    with conn.cursor() as cur:
        cur.execute("SELECT MIN(data), MAX(data), COUNT(*), "
                    "COUNT(*) FILTER (WHERE is_snapshot) FROM extrato_movimentacao")
        mn, mx, total, total_snap = cur.fetchone()
    conn.close()

    logger.info("=" * 70)
    logger.info(f"CONCLUIDO: {stats['chunks_ok']}/{len(chunks)} chunks OK, "
                f"{stats['chunks_falha']} falhas")
    logger.info(f"Registros inseridos nesta execucao: {stats['registros']} "
                f"({stats['snapshots']} snapshots)")
    logger.info(f"TOTAL no Neon: {total} linhas ({total_snap} snapshots) | "
                f"periodo {mn} a {mx}")
    if stats["falhas"]:
        logger.warning(f"Chunks com falha: {stats['falhas']}")
    logger.info("=" * 70)
    return stats


def main():
    parser = argparse.ArgumentParser(description="Baixa extrato VExpenses -> Neon")
    parser.add_argument("--start", default=f"{date.today().year}-01-01",
                        help="Data inicial YYYY-MM-DD (default: 01/01 do ano atual)")
    parser.add_argument("--end", default=date.today().strftime("%Y-%m-%d"),
                        help="Data final YYYY-MM-DD (default: hoje)")
    args = parser.parse_args()
    baixar_extrato_completo(args.start, args.end)


if __name__ == "__main__":
    main()
