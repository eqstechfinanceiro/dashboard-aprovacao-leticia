"""
Cliente HTTP para a API VExpenses v2.
Inclui cache em memória para evitar múltiplas requisições por sessão.
"""
import os
import time
import json
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")

_cache: dict = {}  # key -> (timestamp, data)
_CACHE_TTL = 300   # segundos (5 min por sessão de verificação)
_period_expenses_cache: dict = {}  # Cache global de expenses por período
_expenses_from_file: dict = None  # Cache de expenses carregados do arquivo JSON


def _headers() -> dict:
    return {"Authorization": API_KEY, "Accept": "application/json"}


def _get(endpoint: str, params: dict | None = None, cache_key: str | None = None, timeout: int = 60) -> dict:
    """Faz GET na API com cache em memória."""
    key = cache_key or (endpoint + str(sorted((params or {}).items())))
    now = time.time()
    if key in _cache:
        ts, data = _cache[key]
        if now - ts < _CACHE_TTL:
            return data
    url = BASE_URL.rstrip("/") + endpoint
    resp = requests.get(url, headers=_headers(), params=params or {}, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    _cache[key] = (now, data)
    return data


def clear_cache():
    _cache.clear()
    _period_expenses_cache.clear()
    global _expenses_from_file
    _expenses_from_file = None


def load_expenses_from_file(file_path: str = "data/expenses.json") -> dict:
    """Carrega expenses de um arquivo JSON (baixado via curl).
    
    Args:
        file_path: Caminho para o arquivo JSON com expenses
    
    Returns:
        Dict com expense_id -> expense_data
    """
    global _expenses_from_file
    
    if _expenses_from_file is not None:
        return _expenses_from_file
    
    try:
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
        
        expenses = data.get("data", [])
        _expenses_from_file = {e["id"]: e for e in expenses}
        print(f"Carregados {len(_expenses_from_file)} expenses do arquivo {file_path}")
        return _expenses_from_file
    except FileNotFoundError:
        print(f"Arquivo {file_path} não encontrado. Execute download_expenses.ps1 primeiro.")
        return {}
    except json.JSONDecodeError as e:
        print(f"Erro ao ler JSON de {file_path}: {e}")
        return {}


_approval_flows_from_file: dict = None
_team_members_from_file: dict = None


def load_approval_flows_from_file(file_path: str = "data/approval_flows.json") -> list:
    """Carrega approval flows de um arquivo JSON (baixado via curl).
    
    Args:
        file_path: Caminho para o arquivo JSON com approval flows
    
    Returns:
        List com approval flows
    """
    global _approval_flows_from_file
    
    if _approval_flows_from_file is not None:
        return _approval_flows_from_file
    
    try:
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
        
        flows = data.get("data", [])
        _approval_flows_from_file = flows
        print(f"Carregados {len(_approval_flows_from_file)} approval flows do arquivo {file_path}")
        return _approval_flows_from_file
    except FileNotFoundError:
        print(f"Arquivo {file_path} não encontrado. Execute o curl para approval_flows primeiro.")
        return []
    except json.JSONDecodeError as e:
        print(f"Erro ao ler JSON de {file_path}: {e}")
        return []


def load_team_members_from_file(file_path: str = "data/team_members.json") -> list:
    """Carrega team members de um arquivo JSON (baixado via curl).
    
    Args:
        file_path: Caminho para o arquivo JSON com team members
    
    Returns:
        List com team members
    """
    global _team_members_from_file
    
    if _team_members_from_file is not None:
        return _team_members_from_file
    
    try:
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
        
        members = data.get("data", [])
        _team_members_from_file = members
        print(f"Carregados {len(_team_members_from_file)} team members do arquivo {file_path}")
        return _team_members_from_file
    except FileNotFoundError:
        print(f"Arquivo {file_path} não encontrado. Execute o curl para team_members primeiro.")
        return []
    except json.JSONDecodeError as e:
        print(f"Erro ao ler JSON de {file_path}: {e}")
        return []


def get_or_load_period_expenses(start_date: str, end_date: str, includes: str = "user,expense_type") -> dict:
    """Carrega expenses do arquivo JSON em vez de fazer requisição à API.
    
    Args:
        start_date: Data inicial no formato YYYY-MM-DD (ignorado, usa arquivo)
        end_date: Data final no formato YYYY-MM-DD (ignorado, usa arquivo)
        includes: String com includes separados por vírgula (ignorado, usa arquivo)
    
    Returns:
        Dict com expense_id -> expense_data
    """
    return load_expenses_from_file()


# ---- Endpoints pré-definidos ----

def get_team_members(include: str = "costsCenters") -> list[dict]:
    """Retorna todos os membros (sem paginação)."""
    # Tenta carregar do arquivo primeiro
    members = load_team_members_from_file()
    if members:
        return members
    
    # Se não tiver arquivo, busca da API
    data = _get(
        "/v2/team-members",
        params={"paginate": "false", "per_page": "1000", "include": include},
        cache_key=f"team-members:{include}",
        timeout=60,
    )
    return data.get("data", [])


def get_costs_centers() -> list[dict]:
    """Retorna todos os centros de custo."""
    data = _get("/v2/costs-centers", cache_key="costs-centers", timeout=120)
    return data.get("data", [])


def get_approval_flows() -> list[dict]:
    """Retorna todos os approval flows."""
    # Tenta carregar do arquivo primeiro
    flows = load_approval_flows_from_file()
    if flows:
        return flows
    
    # Se não tiver arquivo, busca da API
    data = _get("/v2/approval-flows", cache_key="approval-flows", timeout=60)
    return data.get("data", [])


def get_expense_by_id(expense_id: int) -> dict | None:
    """Retorna uma despesa por ID específico.
    
    Args:
        expense_id: ID da despesa
    
    Returns:
        Dict com dados da despesa ou None se não encontrado
    """
    try:
        data = _get(
            f"/v2/expenses/{expense_id}",
            params={"include": "user,expense_type,payment_method,costs_center,report"},
            cache_key=f"expense:id:{expense_id}",
            timeout=300,
        )
        if data.get("success") and "data" in data:
            return data["data"]
        return None
    except Exception as e:
        print(f"Erro ao buscar expense {expense_id}: {e}")
        return None


def get_expenses_by_ids(expense_ids: list) -> dict:
    """Retorna despesas por IDs (usando search por id em lotes menores)."""
    if not expense_ids:
        return {}
    
    all_expenses = {}
    # Buscar um por um para evitar 500 errors
    for eid in expense_ids:
        try:
            data = _get(
                "/v2/expenses",
                params={
                    "search": f"id:{eid}",
                    "searchFields": "id:=",
                    "paginate": "false",
                    "per_page": "1",
                },
                cache_key=f"expenses:id:{eid}",
                timeout=300,
            )
            expenses = data.get("data", [])
            if expenses:
                all_expenses.update({e["id"]: e for e in expenses})
        except Exception as e:
            print(f"Erro ao buscar expense {eid}: {e}")
    
    return all_expenses


def get_expenses_by_period(start_date: str, end_date: str, includes: str = "user,expense_type") -> dict:
    """Retorna todas as despesas de um período com todos os includes necessários.
    
    Args:
        start_date: Data inicial no formato YYYY-MM-DD
        end_date: Data final no formato YYYY-MM-DD
        includes: String com includes separados por vírgula
    
    Returns:
        Dict com expense_id -> expense_data
    """
    all_expenses = {}
    page = 1
    per_page = 200
    
    while True:
        try:
            data = _get(
                "/v2/expenses",
                params={
                    "search": f"date:{start_date},{end_date}",
                    "searchFields": "date:between",
                    "paginate": "true",
                    "page": str(page),
                    "per_page": str(per_page),
                    "include": includes,
                },
                cache_key=f"expenses:period:{start_date}:{end_date}:{page}",
                timeout=300,
            )
            expenses = data.get("data", [])
            if not expenses:
                break
            
            all_expenses.update({e["id"]: e for e in expenses})
            
            # Check if there are more pages
            if len(expenses) < per_page:
                break
            
            page += 1
        except Exception as e:
            print(f"Erro ao buscar expenses página {page}: {e}")
            break
    
    return all_expenses


def get_reports_by_ids(report_ids: list) -> dict:
    """Retorna relatórios por IDs."""
    if not report_ids:
        return {}
    # Busca por IDs usando search
    search = ";".join([f"id:{rid}" for rid in report_ids])
    search_fields = ";".join(["id:="] * len(report_ids))
    data = _get(
        "/v2/reports",
        params={
            "search": search,
            "searchFields": search_fields,
            "searchJoin": "or",
            "paginate": "false",
            "per_page": "1000",
            "include": "user",
        },
        cache_key=f"reports:ids:{','.join(map(str, report_ids))}",
        timeout=300,
    )
    reports = data.get("data", [])
    return {r["id"]: r for r in reports}
