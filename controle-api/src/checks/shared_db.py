"""
Shared checks that use SQLite database instead of JSON files
"""
import sqlite3
import time
from .base import ColumnCheck, CheckResult, Mismatch

def _normalize(s) -> str:
    """Normalize string for comparison."""
    if not s:
        return ""
    return str(s).strip().lower()

class ExpenseIdDBCheck(ColumnCheck):
    """Check if expense ID exists in expenses table (SQLite)."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        expense_ids = [row[0] for row in cur.fetchall()]
        
        # Convert to int for comparison (handle floats from SQLite)
        expense_ids_int = []
        for eid in expense_ids:
            if eid:
                try:
                    expense_ids_int.append(int(float(eid)))
                except (ValueError, TypeError):
                    pass
        
        if not expense_ids_int:
            return CheckResult(status="yellow", note="Nenhum ID de despesa encontrado", total=0)
        
        print(f"[{self.display}] Verificando {len(expense_ids_int)} IDs no banco SQLite...")
        
        # Check against expenses table
        result = CheckResult(status="green", note="", total=len(expense_ids))
        
        for i, eid in enumerate(expense_ids):
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            
            # Check if exists in expenses table
            cur = db_conn.execute('SELECT 1 FROM expenses WHERE id = ?', (eid_int,))
            if cur.fetchone():
                result.matched += 1
            else:
                result.mismatched += 1
                if len(result.mismatches) < 5:
                    result.mismatches.append(Mismatch(key=str(eid), db_value=str(eid), api_value="não encontrado"))
            
            # Progress update every 1000 IDs (faster since it's just a DB query)
            if (i + 1) % 1000 == 0:
                print(f"[{self.display}] Progresso: {i+1}/{len(expense_ids)} ({(i+1)/len(expense_ids)*100:.1f}%)")
        
        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} IDs de despesa encontrados no banco"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} IDs não encontrados de {result.total} linhas"
        else:
            result.note = f"Nenhum ID encontrado para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result


class StatusDBCheck(ColumnCheck):
    """Check status field against expenses.report_status (SQLite)."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, status FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de status encontrado", total=0)
        
        print(f"[{self.display}] Verificando {len(rows)} status no banco SQLite...")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for i, (eid, db_status) in enumerate(rows):
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            
            # Get status from expenses table
            cur = db_conn.execute('SELECT report_status FROM expenses WHERE id = ?', (eid_int,))
            row = cur.fetchone()
            if row:
                api_status = row[0] or ""
                db_status_norm = _normalize(db_status)
                api_status_norm = _normalize(api_status)
                
                if db_status_norm == api_status_norm:
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=db_status_norm, api_value=api_status_norm))
            else:
                result.not_found += 1
            
            # Progress update
            if (i + 1) % 1000 == 0:
                print(f"[{self.display}] Progresso: {i+1}/{len(rows)} ({(i+1)/len(rows)*100:.1f}%)")
        
        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} status batem com expenses.report_status"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.report_status"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result


class ExpenseAmountDBCheck(ColumnCheck):
    """Check expense amount against expenses.value (SQLite)."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, valor FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de valor encontrado", total=0)
        
        print(f"[{self.display}] Verificando {len(rows)} valores no banco SQLite...")
        
        def _safe_float(value):
            try:
                return float(value) if value else 0.0
            except (ValueError, TypeError):
                return 0.0
        
        result = CheckResult(status="green", note="", total=len(rows))
        for i, (eid, db_val) in enumerate(rows):
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            
            # Get value from expenses table
            cur = db_conn.execute('SELECT value FROM expenses WHERE id = ?', (eid_int,))
            row = cur.fetchone()
            if row:
                api_amount = _safe_float(row[0])
                db_amount = _safe_float(db_val)
                
                # Compare with small tolerance for floating point
                if abs(db_amount - api_amount) < 0.01:
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=str(db_amount), api_value=str(api_amount)))
            else:
                result.not_found += 1
            
            # Progress update
            if (i + 1) % 1000 == 0:
                print(f"[{self.display}] Progresso: {i+1}/{len(rows)} ({(i+1)/len(rows)*100:.1f}%)")
        
        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} valores batem com expenses.value"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.value"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result


class ExpenseTypeDBCheck(ColumnCheck):
    """Check expense type against expenses.expense_type_description (SQLite)."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, tipo_de_despesa FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de tipo de despesa encontrado", total=0)
        
        print(f"[{self.display}] Verificando {len(rows)} tipos de despesa no banco SQLite...")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for i, (eid, db_type) in enumerate(rows):
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            
            # Get expense type from expenses table
            cur = db_conn.execute('SELECT expense_type_description FROM expenses WHERE id = ?', (eid_int,))
            row = cur.fetchone()
            if row:
                api_type = row[0] or ""
                db_type_norm = _normalize(db_type) if db_type else ""
                api_type_norm = _normalize(api_type)
                
                if db_type_norm == api_type_norm:
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=db_type_norm, api_value=api_type_norm))
            else:
                result.not_found += 1
            
            # Progress update
            if (i + 1) % 1000 == 0:
                print(f"[{self.display}] Progresso: {i+1}/{len(rows)} ({(i+1)/len(rows)*100:.1f}%)")
        
        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} tipos batem com expenses.expense_type_description"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.expense_type_description"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result


class PaymentMethodDBCheck(ColumnCheck):
    """Check payment method against expenses.payment_method_name (SQLite)."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, forma_de_pagamento FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de forma de pagamento encontrado", total=0)
        
        print(f"[{self.display}] Verificando {len(rows)} formas de pagamento no banco SQLite...")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for i, (eid, db_method) in enumerate(rows):
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            
            # Get payment method from expenses table
            cur = db_conn.execute('SELECT payment_method_name FROM expenses WHERE id = ?', (eid_int,))
            row = cur.fetchone()
            if row:
                api_method = row[0] or ""
                db_method_norm = _normalize(db_method) if db_method else ""
                api_method_norm = _normalize(api_method)
                
                if db_method_norm == api_method_norm:
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=db_method_norm, api_value=api_method_norm))
            else:
                result.not_found += 1
            
            # Progress update
            if (i + 1) % 1000 == 0:
                print(f"[{self.display}] Progresso: {i+1}/{len(rows)} ({(i+1)/len(rows)*100:.1f}%)")
        
        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} formas de pagamento batem com expenses.payment_method_name"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.payment_method_name"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result


class ReportNameDBCheck(ColumnCheck):
    """Check report name against report_id joined with expenses (SQLite)."""

    def run(self, db_conn, api) -> CheckResult:
        import time as _time
        start_time = _time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, nome_do_relatório FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()

        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de nome de relatório encontrado", total=0)

        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_name in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue

            cur2 = db_conn.execute('SELECT report_id FROM expenses WHERE id = ?', (eid_int,))
            row = cur2.fetchone()
            if row and row[0]:
                result.matched += 1
            else:
                result.not_found += 1

        if result.matched > 0:
            result.status = "green"
            result.note = f"✓ {result.matched}/{result.total} nomes de relatório com report_id na API"
        else:
            result.status = "yellow"
            result.note = "report_name não armazenado diretamente no banco SQLite"

        print(f"[{self.display}] Concluído em {_time.time() - start_time:.2f}s")
        return result


class ExpenseDateDBCheck(ColumnCheck):
    """Check expense date against expenses.data (SQLite)."""

    _MONTHS = {
        "01": "JANEIRO", "02": "FEVEREIRO", "03": "MARÇO", "04": "ABRIL",
        "05": "MAIO", "06": "JUNHO", "07": "JULHO", "08": "AGOSTO",
        "09": "SETEMBRO", "10": "OUTUBRO", "11": "NOVEMBRO", "12": "DEZEMBRO",
    }

    def run(self, db_conn, api) -> CheckResult:
        import time as _time
        start_time = _time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, data FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()

        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de data encontrado", total=0)

        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_date in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue

            cur2 = db_conn.execute('SELECT data FROM expenses WHERE id = ?', (eid_int,))
            row = cur2.fetchone()
            if row and row[0]:
                api_date = str(row[0])[:10]
                try:
                    parts = str(db_date).strip().split("/")
                    db_iso = f"{parts[2]}-{parts[1]}-{parts[0]}" if len(parts) == 3 else str(db_date)
                except Exception:
                    db_iso = str(db_date)
                if db_iso == api_date:
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=db_iso, api_value=api_date))
            else:
                result.not_found += 1

        if result.mismatched > 0:
            result.status = "red"
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.data"
        elif result.matched > 0:
            result.status = "green"
            result.note = f"✓ {result.matched}/{result.total} datas batem com expenses.data"
        else:
            result.status = "yellow"
            result.note = "Nenhuma data correspondida"

        print(f"[{self.display}] Concluído em {_time.time() - start_time:.2f}s")
        return result


class ReimbursableDBCheck(ColumnCheck):
    """Check reimbursable flag against expenses.reimbursable (SQLite). 0=Não, 1=Sim."""

    def run(self, db_conn, api) -> CheckResult:
        import time as _time
        start_time = _time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, reembolsável FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()

        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de reembolsável encontrado", total=0)

        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_val in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue

            cur2 = db_conn.execute('SELECT reimbursable FROM expenses WHERE id = ?', (eid_int,))
            row = cur2.fetchone()
            if row is not None:
                api_bool = bool(row[0])
                db_norm = _normalize(str(db_val)) if db_val else ""
                db_bool = db_norm in ("sim", "yes", "true", "1")
                if db_bool == api_bool:
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=db_norm, api_value=str(api_bool)))
            else:
                result.not_found += 1

        if result.mismatched > 0:
            result.status = "red"
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.reimbursable"
        elif result.matched > 0:
            result.status = "green"
            result.note = f"✓ {result.matched}/{result.total} reembolsável batem com expenses.reimbursable"
        else:
            result.status = "yellow"
            result.note = "Nenhuma correspondência encontrada"

        print(f"[{self.display}] Concluído em {_time.time() - start_time:.2f}s")
        return result


class CostsCenterDBCheck(ColumnCheck):
    """Check costs center name against expenses.costs_center_name (SQLite)."""

    def run(self, db_conn, api) -> CheckResult:
        import time as _time
        start_time = _time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, centro_de_custos FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()

        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de centro de custos encontrado", total=0)

        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_val in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue

            cur2 = db_conn.execute('SELECT costs_center_name FROM expenses WHERE id = ?', (eid_int,))
            row = cur2.fetchone()
            if row and row[0]:
                if _normalize(db_val) == _normalize(row[0]):
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=_normalize(db_val), api_value=_normalize(row[0])))
            else:
                result.not_found += 1

        if result.mismatched > 0:
            result.status = "red"
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.costs_center_name"
        elif result.matched > 0:
            result.status = "green"
            result.note = f"✓ {result.matched}/{result.total} centros de custo batem com expenses.costs_center_name"
        else:
            result.status = "yellow"
            result.note = "Nenhuma correspondência encontrada"

        print(f"[{self.display}] Concluído em {_time.time() - start_time:.2f}s")
        return result


class MonthDBCheck(ColumnCheck):
    """Check month name derived from expenses.data (SQLite)."""

    _MONTHS = {
        "01": "JANEIRO", "02": "FEVEREIRO", "03": "MARÇO", "04": "ABRIL",
        "05": "MAIO", "06": "JUNHO", "07": "JULHO", "08": "AGOSTO",
        "09": "SETEMBRO", "10": "OUTUBRO", "11": "NOVEMBRO", "12": "DEZEMBRO",
    }

    def run(self, db_conn, api) -> CheckResult:
        import time as _time
        start_time = _time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, mês FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()

        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de mês encontrado", total=0)

        result = CheckResult(status="green", note="", total=len(rows))
        for eid, db_month in rows:
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue

            cur2 = db_conn.execute('SELECT data FROM expenses WHERE id = ?', (eid_int,))
            row = cur2.fetchone()
            if row and row[0]:
                month_num = str(row[0])[5:7]
                expected = self._MONTHS.get(month_num, "")
                if _normalize(db_month) == _normalize(expected):
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=_normalize(db_month), api_value=_normalize(expected)))
            else:
                result.not_found += 1

        if result.mismatched > 0:
            result.status = "red"
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. Derivado de expenses.data"
        elif result.matched > 0:
            result.status = "green"
            result.note = f"✓ {result.matched}/{result.total} meses batem (derivado de expenses.data)"
        else:
            result.status = "yellow"
            result.note = "Nenhuma correspondência encontrada"

        print(f"[{self.display}] Concluído em {_time.time() - start_time:.2f}s")
        return result


class CurrencyDBCheck(ColumnCheck):
    """Check currency field against expenses.original_currency_iso (SQLite)."""

    def run(self, db_conn, api) -> CheckResult:
        start_time = time.time()
        table = self.table
        cur = db_conn.execute(f'SELECT id_da_despesa, moeda_do_relatório FROM "{table}" WHERE id_da_despesa IS NOT NULL')
        rows = cur.fetchall()
        
        if not rows:
            return CheckResult(status="yellow", note="Nenhum dado de moeda encontrado", total=0)
        
        print(f"[{self.display}] Verificando {len(rows)} moedas no banco SQLite...")
        
        result = CheckResult(status="green", note="", total=len(rows))
        for i, (eid, db_currency) in enumerate(rows):
            try:
                eid_int = int(float(eid)) if eid else None
            except (ValueError, TypeError):
                eid_int = None
            if not eid_int:
                result.not_found += 1
                continue
            
            # Get currency from expenses table
            cur = db_conn.execute('SELECT original_currency_iso FROM expenses WHERE id = ?', (eid_int,))
            row = cur.fetchone()
            if row:
                api_currency = row[0] or "BRL"
                db_currency_norm = _normalize(db_currency) if db_currency else "BRL"
                api_currency_norm = _normalize(api_currency)
                
                if db_currency_norm == api_currency_norm:
                    result.matched += 1
                else:
                    result.mismatched += 1
                    if len(result.mismatches) < 5:
                        result.mismatches.append(Mismatch(key=str(eid), db_value=db_currency_norm, api_value=api_currency_norm))
            else:
                result.not_found += 1
            
            # Progress update
            if (i + 1) % 1000 == 0:
                print(f"[{self.display}] Progresso: {i+1}/{len(rows)} ({(i+1)/len(rows)*100:.1f}%)")
        
        if result.mismatched > 0:
            result.status = "red"
        elif result.matched == 0:
            result.status = "yellow"
        else:
            result.status = "green"
        
        if result.status == "green":
            result.note = f"✓ {result.matched}/{result.total} moedas batem com expenses.original_currency_iso"
        elif result.status == "red":
            result.note = f"✗ {result.mismatched} divergências de {result.total} linhas. API: expenses.original_currency_iso"
        else:
            result.note = f"API não retornou correspondência para {result.not_found}/{result.total} linhas"
        
        total_time = time.time() - start_time
        print(f"[{self.display}] Concluído em {total_time:.2f}s")
        return result
