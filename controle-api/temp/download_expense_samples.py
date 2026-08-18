"""
Script para baixar imagens de expenses pendentes (receipt_url).
Foca apenas em imagens de despesas com status ABERTO.
"""
import os
import requests
import json
from pathlib import Path
from dotenv import load_dotenv

# Carregar configuração
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")

OUTPUT_DIR = Path(__file__).parent.parent / "expenses_samples"
IMG_DIR = Path(r"C:\Users\italo.medrado\Desktop\Projects\engine-leitura-imagens\img")
PDF_DIR = OUTPUT_DIR / "pdf"
EXCEL_DIR = OUTPUT_DIR / "excel"


def _headers() -> dict:
    return {"Authorization": API_KEY, "Accept": "application/json"}


def download_file(url: str, output_path: Path) -> bool:
    """Baixa um arquivo de uma URL e salva no caminho especificado."""
    try:
        # URLs do S3 podem não precisar de Authorization header
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'wb') as f:
            f.write(response.content)
        
        print(f"✓ Baixado: {output_path.name} ({len(response.content)} bytes)")
        return True
    except Exception as e:
        print(f"✗ Erro ao baixar {url}: {e}")
        return False


def get_all_pending_expenses_with_receipts() -> list:
    """Busca TODOS os expenses com receipt_url e report ABERTO (com paginação)."""
    try:
        all_expenses = []
        page = 1
        per_page = 200
        
        while True:
            # Buscar expenses por data (filtro mais simples)
            params = {
                "search": "date:2026-06-01,2026-06-30",
                "searchFields": "date:between",
                "include": "user,report",
                "paginate": "true",
                "page": str(page),
                "per_page": str(per_page)
            }
            
            response = requests.get(
                f"{BASE_URL}/v2/expenses",
                headers=_headers(),
                params=params,
                timeout=300
            )
            response.raise_for_status()
            data = response.json()
            
            expenses = data.get("data", [])
            if not expenses:
                break
            
            # Filtrar expenses que têm reicept_url e report com status ABERTO
            for e in expenses:
                receipt = e.get("reicept_url") or e.get("receipt_url")
                report = e.get("report", {}).get("data") if e.get("report") else None
                
                # Se tiver receipt e report com status ABERTO
                if receipt and report and report.get("status") == "ABERTO":
                    all_expenses.append(e)
            
            print(f"   Página {page}: {len(expenses)} expenses, {len(all_expenses)} válidos até agora")
            
            # Verificar se tem mais páginas
            meta = data.get("meta", {})
            total = meta.get("total", 0)
            if len(all_expenses) >= total or len(expenses) < per_page:
                break
            
            page += 1
        
        print(f"   Total de expenses ABERTO com receipt: {len(all_expenses)}")
        return all_expenses
    except Exception as e:
        print(f"✗ Erro ao buscar expenses: {e}")
        return []


def get_pending_reports_with_links(limit: int = 10) -> list:
    """Busca reports ABERTO que tenham pdf_link e excel_link."""
    try:
        params = {
            "include": "user"
        }
        
        response = requests.get(
            f"{BASE_URL}/v2/reports",
            headers=_headers(),
            params=params,
            timeout=300
        )
        response.raise_for_status()
        data = response.json()
        
        reports = data.get("data", [])
        # Filtrar reports ABERTO que têm ambos os links
        valid_reports = [
            r for r in reports 
            if r.get("status") == "ABERTO" and r.get("pdf_link") and r.get("excel_link")
        ]
        
        print(f"   Encontrados {len(valid_reports)} reports ABERTO com PDF e Excel")
        return valid_reports[:limit]
    except Exception as e:
        print(f"✗ Erro ao buscar reports: {e}")
        return []


def main():
    print("=== Baixando TODAS as imagens de expenses ABERTO ===\n")
    
    # Baixar imagens de expenses pendentes
    print("Buscando expenses ABERTO com receipt_url...")
    expenses = get_all_pending_expenses_with_receipts()
    
    if not expenses:
        print("Nenhum expense pendente encontrado com receipt_url.")
        return
    
    print(f"\nBaixando {len(expenses)} imagens para {IMG_DIR}...\n")
    
    img_count = 0
    skipped_count = 0
    
    for expense in expenses:
        expense_id = expense.get("id")
        receipt_url = expense.get("reicept_url") or expense.get("receipt_url")
        
        if receipt_url:
            # Determinar extensão pela URL ou usar .jpg como padrão
            ext = ".jpg"
            if ".png" in receipt_url.lower():
                ext = ".png"
            elif ".jpeg" in receipt_url.lower():
                ext = ".jpeg"
            
            img_path = IMG_DIR / f"expense_{expense_id}{ext}"
            
            # Pular se já existe
            if img_path.exists():
                skipped_count += 1
                if skipped_count % 100 == 0:
                    print(f"   Pulados (já existem): {skipped_count}")
                continue
            
            if download_file(receipt_url, img_path):
                img_count += 1
                if img_count % 50 == 0:
                    print(f"   Progresso: {img_count}/{len(expenses)} baixados")
    
    print(f"\n✓ Imagens baixadas: {img_count}")
    print(f"⊘ Imagens puladas (já existiam): {skipped_count}")
    print(f"✓ Total processado: {img_count + skipped_count}/{len(expenses)}")
    print(f"\n=== Concluído ===")
    print(f"Arquivos salvos em: {IMG_DIR}")


if __name__ == "__main__":
    main()
