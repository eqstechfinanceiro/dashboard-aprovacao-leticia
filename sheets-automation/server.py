#!/usr/bin/env python3
import http.server
import socketserver
import os
import json
import urllib.parse
import requests
from urllib.parse import urlparse, parse_qs

PORT = 8000

# Configuração da API VExpenses
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
API_BASE_URL = "https://api.vexpenses.com/v2"

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        # Proxy para API VExpenses
        if self.path.startswith('/api/'):
            self.handle_api_proxy()
        else:
            super().do_GET()
    
    def handle_api_proxy(self):
        try:
            # Extrair caminho da API
            parsed_path = urlparse(self.path)
            api_path = parsed_path.path.replace('/api/', '')
            query_params = parse_qs(parsed_path.query)
            
            # Construir URL da API
            api_url = f"{API_BASE_URL}/{api_path}"
            
            # Adicionar parâmetros de query
            if query_params:
                params = {}
                for key, values in query_params.items():
                    params[key] = values[0] if len(values) == 1 else values
                api_url += '?' + urllib.parse.urlencode(params)
            
            # Fazer requisição à API
            headers = {
                'Authorization': API_KEY,
                'Accept': 'application/json'
            }
            
            response = requests.get(api_url, headers=headers)
            
            # Retornar resposta
            self.send_response(response.status_code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            if response.status_code == 200:
                self.wfile.write(response.content)
            else:
                error_response = {
                    'error': f'API returned status {response.status_code}',
                    'message': response.text
                }
                self.wfile.write(json.dumps(error_response).encode())
                
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {
                'error': str(e)
            }
            self.wfile.write(json.dumps(error_response).encode())

def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"🚀 Servidor rodando em: http://localhost:{PORT}")
        print(f"📁 Diretório: {os.getcwd()}")
        print(f"🌐 Acesse: http://localhost:{PORT}/pages/index.html")
        print(f"🔗 Proxy API: http://localhost:{PORT}/api/team-members")
        print("Pressione Ctrl+C para parar")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()
