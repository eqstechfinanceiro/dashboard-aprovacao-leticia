"""
Servidor FastAPI para visualização de planilhas via SQLite.
Executa: python src/server.py
Acessa: http://localhost:8000
"""
import os
import sys
import sqlite3
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Garante que controle-api/ está no path para imports absolutos
_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BASE not in sys.path:
    sys.path.insert(0, _BASE)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "spreadsheets.db")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

app = FastAPI(title="Planilhas API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def get_db():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=503, detail=f"Banco não encontrado: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")
    return conn


@app.get("/", response_class=HTMLResponse)
def root():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Frontend não encontrado. Crie src/static/index.html</h1>")


@app.get("/api/sheets")
def get_sheets():
    """Retorna lista de planilhas/abas com metadados e colunas."""
    conn = get_db()
    try:
        sheets = conn.execute(
            "SELECT * FROM spreadsheet_info ORDER BY id"
        ).fetchall()

        result = {}
        for s in sheets:
            fname = s["file_name"]
            if fname not in result:
                result[fname] = {"file_name": fname, "sheets": []}

            cols = conn.execute(
                "SELECT * FROM column_info WHERE spreadsheet_id = ? ORDER BY col_order",
                (s["id"],)
            ).fetchall()

            result[fname]["sheets"].append({
                "id": s["id"],
                "file_name": s["file_name"],
                "sheet_name": s["sheet_name"],
                "table_name": s["table_name"],
                "header_row": s["header_row"],
                "data_start_row": s["data_start_row"],
                "total_rows": s["total_rows"],
                "pre_header_notes": s["pre_header_notes"],
                "columns": [
                    {
                        "id": c["id"],
                        "column_letter": c["column_letter"],
                        "column_name": c["column_name"],
                        "table_column_name": c["table_column_name"],
                        "is_formula": c["is_formula"],
                        "formula_sample": c["formula_sample"],
                        "col_order": c["col_order"],
                        "notes": c["notes"],
                    }
                    for c in cols
                ],
            })

        return list(result.values())
    finally:
        conn.close()


@app.get("/api/sheets/{table_name}/data")
def get_table_data(
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    search: Optional[str] = Query(None),
):
    """Retorna dados paginados de uma tabela com busca opcional."""
    # Validação: só aceita nomes com letras, números e _
    import re
    if not re.match(r'^[a-z0-9_]+$', table_name):
        raise HTTPException(status_code=400, detail="Nome de tabela inválido")

    conn = get_db()
    try:
        # Verifica se tabela existe
        exists = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail=f"Tabela '{table_name}' não encontrada")

        # Monta WHERE de busca se necessário
        where_clause = ""
        params: list = []
        if search and search.strip():
            cols_info = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
            clauses = [f'CAST("{c["name"]}" AS TEXT) LIKE ?' for c in cols_info]
            where_clause = "WHERE " + " OR ".join(clauses)
            params = [f"%{search}%" for _ in cols_info]

        count_sql = f'SELECT COUNT(*) as cnt FROM "{table_name}" {where_clause}'
        total = conn.execute(count_sql, params).fetchone()["cnt"]

        offset = (page - 1) * page_size
        data_sql = f'SELECT * FROM "{table_name}" {where_clause} LIMIT ? OFFSET ?'
        rows_raw = conn.execute(data_sql, params + [page_size, offset]).fetchall()

        rows = [dict(r) for r in rows_raw]

        return {
            "rows": rows,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, -(-total // page_size)),
        }
    finally:
        conn.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "db": DB_PATH, "db_exists": os.path.exists(DB_PATH)}


# ---- Verificação de colunas vs. API ----

@app.get("/api/verify/tables")
def verify_tables():
    """Lista quais tabelas têm checks de verificação definidos."""
    from src.verifier import tables_with_checks
    return {"tables": tables_with_checks()}


@app.get("/api/verify/{table_name}/cached")
def verify_cached(table_name: str):
    """Retorna o último resultado de verificação (sem chamar a API novamente)."""
    from src.verifier import get_cached
    cached = get_cached(table_name)
    if cached is None:
        return {"status": "not_run", "results": []}
    return {"status": "cached", "results": cached}


@app.post("/api/verify/{table_name}/run")
def verify_run(table_name: str):
    """Executa todos os checks de uma tabela contra a API VExpenses."""
    import re
    if not re.match(r'^[a-z0-9_]+$', table_name):
        raise HTTPException(status_code=400, detail="Nome de tabela inválido")
    from src.verifier import run_table, tables_with_checks
    if table_name not in tables_with_checks():
        raise HTTPException(status_code=404, detail=f"Nenhum check definido para '{table_name}'")
    results = run_table(table_name, DB_PATH)
    return {"status": "done", "table": table_name, "results": results}


if __name__ == "__main__":
    print(f"Banco de dados: {DB_PATH}")
    print(f"Acesse: http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
