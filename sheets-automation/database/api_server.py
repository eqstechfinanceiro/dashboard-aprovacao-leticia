#!/usr/bin/env python3
"""
API Backend otimizada com SQLite para consulta de dados
"""
import sqlite3
import json
import os
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import re

class OptimizedAPIHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, db_path="sheets_automation.db", **kwargs):
        self.db_path = db_path
        super().__init__(*args, **kwargs)
        
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query_params = parse_qs(parsed_path.query)
        
        # CORS headers
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json')
        
        try:
            if path == '/api/expenses':
                self.handle_expenses_query(query_params)
            elif path == '/api/sheets':
                self.handle_sheets_list()
            elif path == '/api/sheet-info':
                self.handle_sheet_info(query_params)
            elif path == '/api/search':
                self.handle_search(query_params)
            elif path.startswith('/api/team-members'):
                self.proxy_to_vexpenses_api()
            else:
                self.serve_file(path)
                
        except Exception as e:
            self.send_error(500, f"Internal Server Error: {str(e)}")
            
    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
    def handle_expenses_query(self, query_params):
        """Consulta otimizada de despesas com paginação"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        
        try:
            # Parâmetros da consulta
            sheet_name = query_params.get('sheet', ['base_prest_2025_05'])[0]
            page = int(query_params.get('page', ['1'])[0])
            per_page = min(int(query_params.get('per_page', ['50'])[0]), 1000)  # Limite máximo
            offset = (page - 1) * per_page
            
            # Filtros opcionais
            status_filter = query_params.get('status', [None])[0]
            name_filter = query_params.get('name', [None])[0]
            cpf_filter = query_params.get('cpf', [None])[0]
            
            # Construir consulta SQL
            where_conditions = ['sheet_name = ?']
            params = [sheet_name]
            
            if status_filter:
                where_conditions.append('status LIKE ?')
                params.append(f'%{status_filter}%')
                
            if name_filter:
                where_conditions.append('member_name LIKE ?')
                params.append(f'%{name_filter}%')
                
            if cpf_filter:
                where_conditions.append('member_cpf = ?')
                params.append(cpf_filter)
                
            where_clause = ' AND '.join(where_conditions)
            
            # Consulta principal com paginação
            query = f'''
                SELECT 
                    expense_id, report_id, report_name, expense_date,
                    member_name, member_cpf, bank, agency, account, pix,
                    status, payment_date, expense_description, expense_value,
                    cost_center, project, category, approved_by, row_number
                FROM expenses
                WHERE {where_clause}
                ORDER BY row_number
                LIMIT ? OFFSET ?
            '''
            
            params.extend([per_page, offset])
            
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # Contagem total para paginação
            count_query = f'SELECT COUNT(*) FROM expenses WHERE {where_clause}'
            cursor.execute(count_query, params[:-2])  # Remove LIMIT e OFFSET
            total_count = cursor.fetchone()[0]
            
            # Converter para formato JSON
            data = []
            for row in rows:
                data.append(dict(row))
                
            # Metadados da paginação
            response = {
                'data': data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page,
                    'has_next': offset + per_page < total_count,
                    'has_prev': page > 1
                },
                'filters': {
                    'sheet': sheet_name,
                    'status': status_filter,
                    'name': name_filter,
                    'cpf': cpf_filter
                }
            }
            
            self.end_headers()
            self.wfile.write(json.dumps(response, ensure_ascii=False, indent=2).encode('utf-8'))
            
        finally:
            conn.close()
            
    def handle_sheets_list(self):
        """Lista todas as planilhas disponíveis"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        
        try:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT sheet_name, total_rows, file_size, processed_at
                FROM sheet_metadata
                ORDER BY processed_at DESC
            ''')
            
            sheets = []
            for row in cursor.fetchall():
                sheets.append({
                    'name': row['sheet_name'],
                    'display_name': row['sheet_name'].replace('_', ' ').title(),
                    'total_rows': row['total_rows'],
                    'file_size': row['file_size'],
                    'processed_at': row['processed_at']
                })
                
            response = {'sheets': sheets}
            
            self.end_headers()
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            
        finally:
            conn.close()
            
    def handle_sheet_info(self, query_params):
        """Informações detalhadas de uma planilha"""
        sheet_name = query_params.get('sheet', [None])[0]
        
        if not sheet_name:
            self.send_error(400, "Sheet name required")
            return
            
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        
        try:
            cursor = conn.cursor()
            
            # Metadados da planilha
            cursor.execute('''
                SELECT * FROM sheet_metadata WHERE sheet_name = ?
            ''', (sheet_name,))
            metadata = cursor.fetchone()
            
            if not metadata:
                self.send_error(404, "Sheet not found")
                return
                
            # Estatísticas da planilha
            cursor.execute('''
                SELECT 
                    COUNT(*) as total_rows,
                    COUNT(DISTINCT member_name) as unique_members,
                    COUNT(DISTINCT status) as unique_statuses,
                    SUM(expense_value) as total_value,
                    AVG(expense_value) as avg_value
                FROM expenses WHERE sheet_name = ?
            ''', (sheet_name,))
            stats = cursor.fetchone()
            
            # Distribuição por status
            cursor.execute('''
                SELECT status, COUNT(*) as count
                FROM expenses WHERE sheet_name = ?
                GROUP BY status
                ORDER BY count DESC
            ''', (sheet_name,))
            status_distribution = [dict(row) for row in cursor.fetchall()]
            
            response = {
                'metadata': dict(metadata),
                'statistics': dict(stats),
                'status_distribution': status_distribution
            }
            
            self.end_headers()
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            
        finally:
            conn.close()
            
    def handle_search(self, query_params):
        """Busca avançada em todas as planilhas"""
        search_term = query_params.get('q', [''])[0]
        sheet_name = query_params.get('sheet', [None])[0]
        page = int(query_params.get('page', ['1'])[0])
        per_page = min(int(query_params.get('per_page', ['50'])[0]), 1000)
        offset = (page - 1) * per_page
        
        if not search_term:
            self.send_error(400, "Search term required")
            return
            
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        
        try:
            # Busca em múltiplas colunas
            where_conditions = [
                '(member_name LIKE ? OR member_cpf LIKE ? OR expense_description LIKE ? OR report_name LIKE ?)'
            ]
            params = [f'%{search_term}%'] * 4
            
            if sheet_name:
                where_conditions.append('sheet_name = ?')
                params.append(sheet_name)
                
            where_clause = ' AND '.join(where_conditions)
            
            # Consulta com paginação
            query = f'''
                SELECT *, sheet_name
                FROM expenses
                WHERE {where_clause}
                ORDER BY sheet_name, row_number
                LIMIT ? OFFSET ?
            '''
            
            params.extend([per_page, offset])
            
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # Contagem total
            count_query = f'SELECT COUNT(*) FROM expenses WHERE {where_clause}'
            cursor.execute(count_query, params[:-2])
            total_count = cursor.fetchone()[0]
            
            # Converter para JSON
            results = []
            for row in rows:
                results.append(dict(row))
                
            response = {
                'results': results,
                'search_term': search_term,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page
                }
            }
            
            self.end_headers()
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            
        finally:
            conn.close()
            
    def proxy_to_vexpenses_api(self):
        """Proxy para API VExpenses (mantida para compatibilidade)"""
        # Implementar proxy se necessário
        self.send_error(501, "VExpenses API proxy not implemented in optimized version")
        
    def serve_file(self, path):
        """Servir arquivos estáticos"""
        # Remover o prefixo /
        if path.startswith('/'):
            path = path[1:]
            
        # Segurança: não permitir acesso a arquivos fora do diretório
        if '..' in path or path.startswith('/'):
            self.send_error(403, "Forbidden")
            return
            
        file_path = os.path.join(os.path.dirname(__file__), '..', path)
        
        if not os.path.exists(file_path):
            self.send_error(404, "File not found")
            return
            
        # Determinar content type
        if file_path.endswith('.html'):
            content_type = 'text/html'
        elif file_path.endswith('.css'):
            content_type = 'text/css'
        elif file_path.endswith('.js'):
            content_type = 'application/javascript'
        elif file_path.endswith('.json'):
            content_type = 'application/json'
        else:
            content_type = 'text/plain'
            
        self.send_header('Content-Type', content_type)
        self.end_headers()
        
        with open(file_path, 'rb') as f:
            self.wfile.write(f.read())

def run_server(port=8001, db_path="sheets_automation.db"):
    """Iniciar servidor otimizado"""
    # Criar handler customizado com path do banco
    handler = lambda *args, **kwargs: OptimizedAPIHandler(*args, db_path=db_path, **kwargs)
    
    server = HTTPServer(('localhost', port), handler)
    print(f"🚀 Servidor otimizado rodando em: http://localhost:{port}")
    print(f"📁 Banco de dados: {db_path}")
    print(f"🌐 Acesse: http://localhost:{port}/pages/index_optimized.html")
    print("Pressione Ctrl+C para parar")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Servidor encerrado")
        server.shutdown()

if __name__ == "__main__":
    run_server()
