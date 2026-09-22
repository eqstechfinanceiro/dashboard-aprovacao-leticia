"""Z01 sync worker — mirrors TOTVS report/item state into the Aery DB
(``dashboard_financeiro`` on the VPS, schema ``z01``).

Runs forever on any machine (no browser needed — pure Z01 REST API +
PostgreSQL). Each cycle:

  1. Query ALL pending items (Z01_STATUS='P') → the set of reports that are
     PENDENTE or PARCIAL (a partial report still has pending items).
  2. For each such report, fetch ALL its items and upsert them into
     ``totvs_z01_items`` (full field set, including Z01_JSON).
  3. Upsert a rollup row per report into ``totvs_reports`` with per-status
     counts and a derived state: PENDENTE | PARCIAL | LANCADO | FINALIZADO.
  4. Reports tracked previously that no longer have pending items get one
     final refresh — if nothing is pending anymore they're FINALIZADO.

Tables (created automatically):

  totvs_z01_items   one row per Z01 item — all fields + synced_at
  totvs_reports     one row per report  — counts + derived state

Usage:
    PYTHONIOENCODING=utf-8 python run_sync_worker.py [--interval 60] [--meipag V]

Requires AERY_DATABASE_URL in .env (or env var):
    postgresql://z01_sync:pass@179.199.149.43:5432/dashboard_financeiro
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from src.services.aery_db import connect as db_connect, Json
from src.api.totvs_api import TotvsZ01API
from src.api.z01_queries import (
    where_pending, where_launched_or_finalized, where_report_items,
    FIELDS_ALL,
)

logger = logging.getLogger("z01_sync")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")

ROOT = Path(__file__).parent.parent.parent

_SCHEMA = """
CREATE TABLE IF NOT EXISTS totvs_z01_items (
    item_key      TEXT PRIMARY KEY,
    idagil        TEXT NOT NULL,
    vexpenses_id  TEXT,
    status        TEXT,
    tipdoc        TEXT,
    dtemis        TEXT,
    numdoc        TEXT,
    chvnfe        TEXT,
    valor         NUMERIC,
    cc            TEXT,
    nature        TEXT,
    iduser        TEXT,
    catego        TEXT,
    meipag        TEXT,
    doc           TEXT,
    serie         TEXT,
    observ        TEXT,
    staagl        TEXT,
    xmlnfe        TEXT,
    json_data     JSONB,
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_totvs_z01_items_idagil ON totvs_z01_items (idagil);
CREATE INDEX IF NOT EXISTS ix_totvs_z01_items_status ON totvs_z01_items (status);

CREATE TABLE IF NOT EXISTS totvs_reports (
    idagil      TEXT PRIMARY KEY,
    item_count  INT NOT NULL DEFAULT 0,
    pending     INT NOT NULL DEFAULT 0,
    launched    INT NOT NULL DEFAULT 0,
    finished    INT NOT NULL DEFAULT 0,
    total       NUMERIC,
    user_id     TEXT,
    meipag      TEXT,
    dtemis      TEXT,
    state       TEXT,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notas de entrada pendentes de lançamento (tabela SDS — importação XML NF-e,
-- rotina MATA143). EQS e BRATEC são o mesmo servidor TOTVS; a empresa vem do
-- tenantId da query (02,02 = EQS, 11,01 = BRATEC).
CREATE TABLE IF NOT EXISTS totvs_sds_notas (
    nota_key      TEXT PRIMARY KEY,   -- empresa|doc|serie|chavenf|cnpj
    empresa       TEXT NOT NULL,      -- EQS | BRATEC
    filial        TEXT,
    tipo          TEXT,               -- DS_TIPO (N=normal, B=benef.)
    classificacao TEXT,               -- MERCADORIA | SERVICO | REMESSA
    doc           TEXT,
    serie         TEXT,
    fornec        TEXT,
    loja          TEXT,
    nomefor       TEXT,
    cnpj          TEXT,
    especi        TEXT,               -- NFS | SPED | ...
    emissa        TEXT,
    est           TEXT,
    status        TEXT,               -- P=pendente, G=gerada, RESOLVIDO
    chavenf       TEXT,
    numrps        TEXT,
    modelo        TEXT,
    valmerc       NUMERIC,
    total_nf      NUMERIC,
    setor         TEXT,               -- DS_SETATU (código bruto: C, 1, 2, 3...)
    fila          TEXT,               -- fila de trabalho derivada (ver abaixo)
    pvenc         TEXT,               -- DS_PVENC 1º vencimento
    dataimp       TEXT,
    userimp       TEXT,
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE totvs_sds_notas ADD COLUMN IF NOT EXISTS total_nf NUMERIC;
ALTER TABLE totvs_sds_notas ADD COLUMN IF NOT EXISTS setor TEXT;
ALTER TABLE totvs_sds_notas ADD COLUMN IF NOT EXISTS fila TEXT;
ALTER TABLE totvs_sds_notas ADD COLUMN IF NOT EXISTS pvenc TEXT;
CREATE INDEX IF NOT EXISTS ix_totvs_sds_empresa ON totvs_sds_notas (empresa, status);
CREATE INDEX IF NOT EXISTS ix_totvs_sds_setor ON totvs_sds_notas (setor);
CREATE INDEX IF NOT EXISTS ix_totvs_sds_fila ON totvs_sds_notas (fila);
CREATE INDEX IF NOT EXISTS ix_totvs_sds_class ON totvs_sds_notas (classificacao);
CREATE INDEX IF NOT EXISTS ix_totvs_sds_emissa ON totvs_sds_notas (emissa);
"""

_UPSERT_ITEM = """
INSERT INTO totvs_z01_items (
    item_key, idagil, vexpenses_id, status, tipdoc, dtemis, numdoc, chvnfe,
    valor, cc, nature, iduser, catego, meipag, doc, serie, observ, staagl,
    xmlnfe, json_data, synced_at
) VALUES (
    %(item_key)s, %(idagil)s, %(vexpenses_id)s, %(status)s, %(tipdoc)s,
    %(dtemis)s, %(numdoc)s, %(chvnfe)s, %(valor)s, %(cc)s, %(nature)s,
    %(iduser)s, %(catego)s, %(meipag)s, %(doc)s, %(serie)s, %(observ)s,
    %(staagl)s, %(xmlnfe)s, %(json_data)s, %(synced_at)s
)
ON CONFLICT (item_key) DO UPDATE SET
    status=EXCLUDED.status, tipdoc=EXCLUDED.tipdoc, dtemis=EXCLUDED.dtemis,
    numdoc=EXCLUDED.numdoc, chvnfe=EXCLUDED.chvnfe, valor=EXCLUDED.valor,
    cc=EXCLUDED.cc, nature=EXCLUDED.nature, iduser=EXCLUDED.iduser,
    catego=EXCLUDED.catego, meipag=EXCLUDED.meipag, doc=EXCLUDED.doc,
    serie=EXCLUDED.serie, observ=EXCLUDED.observ, staagl=EXCLUDED.staagl,
    xmlnfe=EXCLUDED.xmlnfe, json_data=EXCLUDED.json_data,
    synced_at=EXCLUDED.synced_at;
"""

_UPSERT_REPORT = """
INSERT INTO totvs_reports (
    idagil, item_count, pending, launched, finished, total, user_id,
    meipag, dtemis, state, synced_at
) VALUES (
    %(idagil)s, %(item_count)s, %(pending)s, %(launched)s, %(finished)s,
    %(total)s, %(user_id)s, %(meipag)s, %(dtemis)s, %(state)s, %(synced_at)s
)
ON CONFLICT (idagil) DO UPDATE SET
    item_count=EXCLUDED.item_count, pending=EXCLUDED.pending,
    launched=EXCLUDED.launched, finished=EXCLUDED.finished,
    total=EXCLUDED.total, user_id=EXCLUDED.user_id, meipag=EXCLUDED.meipag,
    dtemis=EXCLUDED.dtemis, state=EXCLUDED.state, synced_at=EXCLUDED.synced_at;
"""


def _load_env() -> None:
    """Minimal .env loader — no dotenv dependency."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _item_key(row: dict, parsed: dict) -> str:
    """Stable primary key: report|vexpenses_id, falling back to doc|valor."""
    rid = str(row.get("z01_idagil", "")).strip()
    vex = str(parsed.get("id", "")).strip()
    if vex:
        return f"{rid}|{vex}"
    doc = str(row.get("z01_numdoc", "")).strip() or str(row.get("z01_doc", "")).strip()
    valor = row.get("z01_valor", "")
    return f"{rid}|{doc}|{valor}"


_SDS_FIELDS = (
    "DS_FILIAL,DS_TIPO,DS_DOC,DS_SERIE,DS_FORNEC,DS_LOJA,DS_NOMEFOR,DS_CNPJ,"
    "DS_ESPECI,DS_EMISSA,DS_EST,DS_STATUS,DS_DATAIMP,DS_USERIMP,DS_CHAVENF,"
    "DS_NUMRPS,DS_MODELO,DS_VALMERC,DS_SETATU,DS_PVENC,DS_TOTAL"
)

# empresa → TOTVS tenantId (mesmo servidor; empresa = grupo no login)
_SDS_TENANTS = {"EQS": "02,02", "BRATEC": "11,01"}

_UPSERT_SDS = """
INSERT INTO totvs_sds_notas (
    nota_key, empresa, filial, tipo, classificacao, doc, serie, fornec, loja,
    nomefor, cnpj, especi, emissa, est, status, chavenf, numrps, modelo,
    valmerc, total_nf, setor, fila, pvenc, dataimp, userimp, synced_at
) VALUES (
    %(nota_key)s, %(empresa)s, %(filial)s, %(tipo)s, %(classificacao)s,
    %(doc)s, %(serie)s, %(fornec)s, %(loja)s, %(nomefor)s, %(cnpj)s,
    %(especi)s, %(emissa)s, %(est)s, %(status)s, %(chavenf)s, %(numrps)s,
    %(modelo)s, %(valmerc)s, %(total_nf)s, %(setor)s, %(fila)s, %(pvenc)s,
    %(dataimp)s, %(userimp)s, %(synced_at)s
)
ON CONFLICT (nota_key) DO UPDATE SET
    tipo=EXCLUDED.tipo, classificacao=EXCLUDED.classificacao,
    nomefor=EXCLUDED.nomefor, cnpj=EXCLUDED.cnpj, especi=EXCLUDED.especi,
    emissa=EXCLUDED.emissa, est=EXCLUDED.est, status=EXCLUDED.status,
    chavenf=EXCLUDED.chavenf, numrps=EXCLUDED.numrps, modelo=EXCLUDED.modelo,
    valmerc=EXCLUDED.valmerc, total_nf=EXCLUDED.total_nf,
    setor=EXCLUDED.setor, fila=EXCLUDED.fila, pvenc=EXCLUDED.pvenc,
    dataimp=EXCLUDED.dataimp,
    userimp=EXCLUDED.userimp, synced_at=EXCLUDED.synced_at;
"""


def _sds_classificacao(modelo: str, especi: str) -> str:
    """DS_MODELO/DS_ESPECI → MERCADORIA | SERVICO | REMESSA."""
    if modelo == "S" or especi == "NFS":
        return "SERVICO"
    if modelo == "R":
        return "REMESSA"
    return "MERCADORIA"  # modelo '1', '55', '65' etc.


def _sds_fila(setor: str) -> str:
    """Derived work queue for the dashboard.

    DS_SETATU é o setor atual do documento no fluxo de entrada. Verificado
    nos dados (set/2026): as notas saem de status P quase sempre a partir
    do setor '2' (EQS 174, BRATEC 51 resolvidas) — é o setor contábil, que
    corresponde ao filtro "Situação Processo = Contábil" do monitor SDS.
    Demais setores (1, 3, F, C...) são etapas anteriores ou backlog morto.
    """
    if setor == "2":
        return "CONTABIL"
    return "OUTROS"


def _state_of(counts: dict[str, int]) -> str:
    """Derived report state from per-status item counts."""
    if counts.get("P", 0) == 0 and counts.get("F", 0) == counts.get("_total", 0):
        return "FINALIZADO"
    if counts.get("P", 0) > 0 and (counts.get("L", 0) + counts.get("F", 0)) > 0:
        return "PARCIAL"
    if counts.get("P", 0) > 0:
        return "PENDENTE"
    return "LANCADO"


class Z01SyncWorker:
    def __init__(self, meipag: str = "V", interval: float = 60.0):
        self.api = TotvsZ01API()
        self.meipag = meipag
        self.interval = interval
        self._tracked: set[str] = set()   # reports with pending items last cycle
        self._conn = None

    # ── DB ────────────────────────────────────────────────────────────

    def _connect(self):
        self._conn = db_connect()
        with self._conn.cursor() as cur:
            cur.execute(_SCHEMA)
        logger.info("DB connected — schema ensured (aery/dashboard_financeiro)")

    def _db(self):
        if self._conn is None or self._conn.closed:
            self._connect()
        return self._conn

    # ── Sync ──────────────────────────────────────────────────────────

    def _sync_report(self, rid: str) -> tuple[int, int]:
        """Fetch every item of a report and upsert rows + rollup.

        Returns (items, pending_count).
        """
        t0 = time.monotonic()
        rows = self.api.query_all_pages(
            where_report_items(rid), fields=FIELDS_ALL, page_size=500)
        now = datetime.now(timezone.utc)
        conn = self._db()
        counts: dict[str, int] = {}
        total = 0.0
        user_id = meipag = dtemis = ""

        with conn.cursor() as cur:
            for row in rows:
                raw_json = row.get("z01_json", "")
                parsed = {}
                if isinstance(raw_json, str) and raw_json.strip():
                    try:
                        parsed = json.loads(raw_json)
                    except Exception:
                        parsed = {}
                elif isinstance(raw_json, dict):
                    parsed = raw_json

                status = str(row.get("z01_status", "")).strip()
                counts[status] = counts.get(status, 0) + 1
                counts["_total"] = counts.get("_total", 0) + 1
                try:
                    total += float(row.get("z01_valor") or 0)
                except (TypeError, ValueError):
                    pass
                user_id = user_id or str(row.get("z01_iduser", "")).strip()
                meipag = meipag or str(row.get("z01_meipag", "")).strip()
                d = str(row.get("z01_dtemis", "")).strip()
                dtemis = min(dtemis, d) if dtemis else d

                cur.execute(_UPSERT_ITEM, {
                    "item_key": _item_key(row, parsed),
                    "idagil": rid,
                    "vexpenses_id": str(parsed.get("id", "")).strip() or None,
                    "status": status, "tipdoc": str(row.get("z01_tipdoc", "")).strip(),
                    "dtemis": d, "numdoc": str(row.get("z01_numdoc", "")).strip(),
                    "chvnfe": str(row.get("z01_chvnfe", "")).strip(),
                    "valor": row.get("z01_valor") or 0,
                    "cc": str(row.get("z01_cc", "")).strip(),
                    "nature": str(row.get("z01_nature", "")).strip(),
                    "iduser": str(row.get("z01_iduser", "")).strip(),
                    "catego": str(row.get("z01_catego", "")).strip(),
                    "meipag": str(row.get("z01_meipag", "")).strip(),
                    "doc": str(row.get("z01_doc", "")).strip(),
                    "serie": str(row.get("z01_serie", "")).strip(),
                    "observ": str(row.get("z01_observ", "")).strip(),
                    "staagl": str(row.get("z01_staagl", "")).strip(),
                    "xmlnfe": str(row.get("z01_xmlnfe", "")).strip(),
                    "json_data": Json(parsed) if parsed else None,
                    "synced_at": now,
                })

            cur.execute(_UPSERT_REPORT, {
                "idagil": rid,
                "item_count": counts.get("_total", 0),
                "pending": counts.get("P", 0),
                "launched": counts.get("L", 0),
                "finished": counts.get("F", 0),
                "total": total, "user_id": user_id, "meipag": meipag,
                "dtemis": dtemis, "state": _state_of(counts),
                "synced_at": now,
            })

        logger.info("R%s: %d items synced (%dP/%dL/%dF, %.1fs)",
                    rid, counts.get("_total", 0), counts.get("P", 0),
                    counts.get("L", 0), counts.get("F", 0),
                    time.monotonic() - t0)
        return counts.get("_total", 0), counts.get("P", 0)

    def _sync_sds_empresa(self, empresa: str, tenant_id: str) -> int:
        """Sync pending inbound NF-e docs (SDS status='P') for one empresa.

        Rows that leave the P set are marked RESOLVIDO instead of deleted, so
        the dashboard can show recent history too.
        """
        t0 = time.monotonic()
        rows = self.api.query_all_pages(
            "SDS.D_E_L_E_T_=' ' AND SDS.DS_STATUS='P'",
            fields=_SDS_FIELDS, page_size=500,
            table="SDS", tenant_id=tenant_id)
        now = datetime.now(timezone.utc)
        conn = self._db()
        seen: set[str] = set()

        with conn.cursor() as cur:
            for row in rows:
                doc = str(row.get("ds_doc", "")).strip()
                serie = str(row.get("ds_serie", "")).strip()
                chavenf = str(row.get("ds_chavenf", "")).strip()
                cnpj = str(row.get("ds_cnpj", "")).strip()
                modelo = str(row.get("ds_modelo", "")).strip()
                especi = str(row.get("ds_especi", "")).strip()
                classificacao = _sds_classificacao(modelo, especi)
                setor = str(row.get("ds_setatu", "")).strip()
                key = f"{empresa}|{doc}|{serie}|{chavenf or cnpj}|{row.get('ds_valmerc') or ''}"
                seen.add(key)
                cur.execute(_UPSERT_SDS, {
                    "nota_key": key, "empresa": empresa,
                    "filial": str(row.get("ds_filial", "")).strip(),
                    "tipo": str(row.get("ds_tipo", "")).strip(),
                    "classificacao": classificacao,
                    "doc": doc, "serie": serie,
                    "fornec": str(row.get("ds_fornec", "")).strip(),
                    "loja": str(row.get("ds_loja", "")).strip(),
                    "nomefor": str(row.get("ds_nomefor", "")).strip(),
                    "cnpj": cnpj, "especi": especi,
                    "emissa": str(row.get("ds_emissa", "")).strip(),
                    "est": str(row.get("ds_est", "")).strip(),
                    "status": "P",
                    "chavenf": chavenf,
                    "numrps": str(row.get("ds_numrps", "")).strip(),
                    "modelo": modelo,
                    "valmerc": row.get("ds_valmerc") or 0,
                    "total_nf": row.get("ds_total") or 0,
                    "setor": setor,
                    "fila": _sds_fila(setor),
                    "pvenc": str(row.get("ds_pvenc", "")).strip(),
                    "dataimp": str(row.get("ds_dataimp", "")).strip(),
                    "userimp": str(row.get("ds_userimp", "")).strip(),
                    "synced_at": now,
                })
            # Rows still marked P locally but absent from the live P set are
            # resolved (geradas/canceladas/removidas).
            cur.execute(
                "UPDATE totvs_sds_notas SET status='RESOLVIDO', synced_at=%s "
                "WHERE empresa=%s AND status='P' AND nota_key <> ALL(%s)",
                (now, empresa, list(seen) or [""]))

        logger.info("SDS %s: %d pendentes synced (%.1fs)",
                    empresa, len(seen), time.monotonic() - t0)
        return len(seen)

    def _sync_meipag_rollups(self, meipag: str, skip: set[str]) -> dict:
        """Light rollup sync for a meipag we don't fully mirror ('I' = Itaú).

        The dashboard needs report-level counts/values for Itaú caixas too
        (e.g. the "a conferir" queue counts PARCIAL reports of every meipag),
        but syncing all ~2k pending I reports item-by-item every cycle would
        be too heavy. So:

          - Pending I items  → grouped by report (count + value)
          - L/F I items      → reports having both are PARCIAL
          - PARCIAL reports  → full _sync_report (item-level detail)
          - PENDENTE reports → rollup-only upsert (all items are pending)
          - Reports that left the pending set → one refresh to mark
            LANCADO/FINALIZADO.

        `skip` = report ids already fully synced this cycle (V flow) — their
        rollup row is authoritative, don't overwrite with partial data.
        """
        t0 = time.monotonic()
        F = "Z01_IDAGIL,Z01_VALOR,Z01_DTEMIS,Z01_IDUSER"

        pend: dict[str, dict] = {}
        for r in self.api.query_all_pages(
                where_pending(meipag), fields=F, page_size=500):
            rid = str(r.get("z01_idagil") or "").strip()
            if not rid:
                continue
            g = pend.setdefault(rid, {"n": 0, "v": 0.0, "dtemis": "", "user": ""})
            g["n"] += 1
            try:
                g["v"] += float(r.get("z01_valor") or 0)
            except (TypeError, ValueError):
                pass
            d = str(r.get("z01_dtemis") or "").strip()
            g["dtemis"] = min(g["dtemis"], d) if g["dtemis"] else d
            g["user"] = g["user"] or str(r.get("z01_iduser") or "").strip()

        lf: set[str] = set()
        for r in self.api.query_all_pages(
                where_launched_or_finalized(meipag), fields="Z01_IDAGIL",
                page_size=500):
            rid = str(r.get("z01_idagil") or "").strip()
            if rid:
                lf.add(rid)

        parciais = sorted(set(pend) & lf - skip)
        for rid in parciais:
            try:
                self._sync_report(rid)
            except Exception as e:
                logger.error("R%s (%s) sync failed: %s", rid, meipag, e)

        now = datetime.now(timezone.utc)
        conn = self._db()
        with conn.cursor() as cur:
            for rid, g in pend.items():
                if rid in lf or rid in skip:
                    continue
                cur.execute(_UPSERT_REPORT, {
                    "idagil": rid, "item_count": g["n"], "pending": g["n"],
                    "launched": 0, "finished": 0, "total": g["v"],
                    "user_id": g["user"], "meipag": meipag,
                    "dtemis": g["dtemis"], "state": "PENDENTE",
                    "synced_at": now,
                })
            # Reports no longer pending → refresh once to settle final state
            cur.execute(
                "SELECT idagil FROM totvs_reports "
                "WHERE meipag=%s AND state IN ('PENDENTE','PARCIAL')",
                (meipag,))
            stale = [r[0] for r in cur.fetchall()
                     if r[0] not in pend and r[0] not in skip]

        for rid in stale:
            try:
                self._sync_report(rid)
            except Exception as e:
                logger.error("R%s (%s) reconcile failed: %s", rid, meipag, e)

        stats = {"pendentes": len(pend) - len(parciais),
                 "parciais": len(parciais), "reconciled": len(stale)}
        logger.info("%s rollups: %s (%.1fs)", meipag, stats,
                    time.monotonic() - t0)
        return stats

    def run_once(self) -> dict:
        """One sync cycle. Returns stats."""
        t0 = time.monotonic()
        if not self.api.authenticate():
            raise RuntimeError("Z01 API auth failed")

        pending_rows = self.api.query_all_pages(
            where_pending(self.meipag), fields="Z01_IDAGIL", page_size=500)
        pending_reports = {str(r.get("z01_idagil", "")).strip()
                           for r in pending_rows if r.get("z01_idagil")}
        pending_reports.discard("")

        # Reports to refresh: everything currently pending/partial, plus
        # previously-tracked reports (they may have just finalized).
        to_sync = pending_reports | self._tracked
        stats = {"reports": 0, "items": 0, "pending_reports": len(pending_reports)}
        for rid in sorted(to_sync):
            try:
                n_items, n_pending = self._sync_report(rid)
                stats["reports"] += 1
                stats["items"] += n_items
            except Exception as e:
                logger.error("R%s sync failed: %s", rid, e)

        self._tracked = pending_reports

        # Itaú (meipag='I') — rollup-only sync so the dashboard sees PARCIAL
        # I caixas too ("a conferir" counts them; "a lançar" is V-only).
        if self.meipag == "V":
            try:
                stats["meipag_i"] = self._sync_meipag_rollups("I", to_sync)
            except Exception as e:
                logger.error("meipag I rollup sync failed: %s", e)

        # SDS — notas de entrada pendentes (mercadoria/serviço), por empresa
        sds_pending = 0
        for empresa, tenant in _SDS_TENANTS.items():
            try:
                sds_pending += self._sync_sds_empresa(empresa, tenant)
            except Exception as e:
                logger.error("SDS %s sync failed: %s", empresa, e)
        stats["sds_pendentes"] = sds_pending

        stats["elapsed_s"] = round(time.monotonic() - t0, 1)
        logger.info("SYNC cycle done: %s", stats)
        return stats

    def run(self) -> None:
        logger.info("Z01 sync worker started — interval %.0fs, meipag=%s",
                    self.interval, self.meipag)
        self._connect()
        while True:
            try:
                self.run_once()
            except Exception as e:
                logger.error("SYNC cycle failed: %s — retrying in 30s", e)
                try:
                    self._conn.close()
                except Exception:
                    pass
                self._conn = None
                time.sleep(30)
                continue
            time.sleep(self.interval)


def main():
    _load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=float, default=60.0,
                    help="seconds between sync cycles")
    ap.add_argument("--meipag", default="V")
    ap.add_argument("--once", action="store_true", help="single cycle then exit")
    args = ap.parse_args()

    w = Z01SyncWorker(meipag=args.meipag, interval=args.interval)
    if args.once:
        w._connect()
        w.run_once()
    else:
        w.run()


if __name__ == "__main__":
    main()
