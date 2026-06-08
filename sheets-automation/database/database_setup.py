#!/usr/bin/env python3
"""
Migração de JSON para SQLite para performance otimizada
"""
import sqlite3
import json
import os
from datetime import datetime
from pathlib import Path

class DatabaseMigrator:
    def __init__(self, db_path="sheets_automation.db"):
        self.db_path = db_path
        self.conn = None
        
    def connect(self):
        """Conectar ao banco SQLite"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row  # Para acessar colunas por nome
        
    def create_tables(self):
        """Criar tabelas otimizadas"""
        cursor = self.conn.cursor()
        
        # Tabela principal de despesas
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER,
                report_id INTEGER,
                report_name TEXT,
                expense_date TEXT,
                member_name TEXT,
                member_cpf TEXT,
                bank TEXT,
                agency TEXT,
                account TEXT,
                pix TEXT,
                status TEXT,
                payment_date TEXT,
                expense_description TEXT,
                expense_value REAL,
                cost_center TEXT,
                project TEXT,
                category TEXT,
                approved_by TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                INDEXED_BY TEXT,
                SHEET_NAME TEXT,
                ROW_NUMBER INTEGER
            )
        ''')
        
        # Índices para performance
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_member_cpf ON expenses(member_cpf)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_member_name ON expenses(member_name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_status ON expenses(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_expense_date ON expenses(expense_date)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sheet_name ON expenses(sheet_name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_expense_id ON expenses(expense_id)')
        
        # Tabela de metadados das planilhas
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sheet_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sheet_name TEXT UNIQUE,
                file_name TEXT,
                total_rows INTEGER,
                processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                file_size INTEGER
            )
        ''')
        
        # Tabela de cache de validação API
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS api_validation_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cpf TEXT,
                name TEXT,
                api_data TEXT,  -- JSON com dados da API
                found BOOLEAN,
                last_validated TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(cpf, name)
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_validation_cpf ON api_validation_cache(cpf)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_validation_name ON api_validation_cache(name)')
        
        self.conn.commit()
        print("✅ Tabelas criadas com sucesso")
        
    def migrate_json_file(self, json_path, sheet_name):
        """Migrar arquivo JSON para SQLite"""
        print(f"📊 Migrando {json_path} para tabela '{sheet_name}'...")
        
        if not os.path.exists(json_path):
            print(f"❌ Arquivo não encontrado: {json_path}")
            return
            
        # Carregar JSON
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Lidar com diferentes formatos JSON
        if isinstance(data, dict):
            # JSON com abas (ex: {"Planilha1": [...], "Planilha2": [...]})
            print(f"📋 JSON com {len(data)} abas detectado")
            
            for sheet_key, sheet_data in data.items():
                if isinstance(sheet_data, list) and len(sheet_data) > 0:
                    # Migrar cada aba como uma tabela separada
                    sheet_table_name = f"{sheet_name}_{sheet_key.lower().replace(' ', '_')}"
                    self.migrate_sheet_data(sheet_data, sheet_table_name, json_path, sheet_key)
                    
        elif isinstance(data, list):
            # JSON array direto (ex: [{"col1": "val1"}, ...])
            self.migrate_sheet_data(data, sheet_name, json_path)
        else:
            print(f"❌ Formato JSON inválido: esperado array ou dict, recebido {type(data)}")
            return
            
    def migrate_sheet_data(self, sheet_data, sheet_name, json_path, sheet_key=None):
        """Migrar dados de uma aba específica"""
        print(f"📊 Migrando aba '{sheet_key or sheet_name}' com {len(sheet_data)} registros...")
        
        if not sheet_data or len(sheet_data) == 0:
            print(f"⚠️ Nenhum dado encontrado na aba '{sheet_key or sheet_name}'")
            return
            
        cursor = self.conn.cursor()
        
        # Limpar dados existentes para esta planilha
        cursor.execute('DELETE FROM expenses WHERE sheet_name = ?', (sheet_name,))
        
        # Para dados em formato de array (linhas x colunas), precisamos converter
        if isinstance(sheet_data, list) and len(sheet_data) > 0:
            # Verificar se é array de arrays ou array de objetos
            first_row = sheet_data[0]
            
            if isinstance(first_row, list):
                # Array de arrays - converter para objetos usando primeira linha como cabeçalho
                if len(sheet_data) < 2:
                    print(f"⚠️ Apenas cabeçalho encontrado, sem dados")
                    return
                    
                headers = sheet_data[0]
                data_rows = sheet_data[1:]  # Pular cabeçalho
                
                # Mapear colunas
                column_mapping = self.get_column_mapping_from_headers(headers)
                
                # Inserir registros
                batch_size = 1000
                total_inserted = 0
                
                for i in range(0, len(data_rows), batch_size):
                    batch = data_rows[i:i + batch_size]
                    
                    for row_num, row in enumerate(batch, start=i + 2):  # +2 porque pula cabeçalho
                        if not isinstance(row, list):
                            continue
                            
                        # Mapear colunas
                        mapped_data = {}
                        for db_col, header_name in column_mapping.items():
                            col_index = headers.index(header_name) if header_name in headers else -1
                            if col_index >= 0 and col_index < len(row):
                                mapped_data[db_col] = row[col_index]
                                
                        # Adicionar metadados
                        mapped_data['sheet_name'] = sheet_name
                        mapped_data['row_number'] = row_num
                        mapped_data['indexed_by'] = 'migration_script'
                        
                        # Inserir no banco
                        self._insert_record(cursor, mapped_data)
                        
                    total_inserted += len(batch)
                    print(f"✅ Processados {total_inserted}/{len(data_rows)} registros...")
                    
                    # Commit a cada lote
                    self.conn.commit()
                    
            elif isinstance(first_row, dict):
                # Array de objetos - já está no formato correto
                column_mapping = self.get_column_mapping(first_row)
                
                batch_size = 1000
                total_inserted = 0
                
                for i in range(0, len(sheet_data), batch_size):
                    batch = sheet_data[i:i + batch_size]
                    
                    for row_num, row in enumerate(batch, start=i + 1):
                        if not isinstance(row, dict):
                            continue
                            
                        # Mapear colunas
                        mapped_data = {}
                        for db_col, json_col in column_mapping.items():
                            mapped_data[db_col] = row.get(json_col)
                            
                        # Adicionar metadados
                        mapped_data['sheet_name'] = sheet_name
                        mapped_data['row_number'] = row_num
                        mapped_data['indexed_by'] = 'migration_script'
                        
                        # Inserir no banco
                        self._insert_record(cursor, mapped_data)
                        
                    total_inserted += len(batch)
                    print(f"✅ Processados {total_inserted}/{len(sheet_data)} registros...")
                    
                    # Commit a cada lote
                    self.conn.commit()
                    
        # Atualizar metadados
        file_size = os.path.getsize(json_path)
        cursor.execute('''
            INSERT OR REPLACE INTO sheet_metadata 
            (sheet_name, file_name, total_rows, file_size)
            VALUES (?, ?, ?, ?)
        ''', (sheet_name, os.path.basename(json_path), len(sheet_data), file_size))
        
        self.conn.commit()
        print(f"✅ Migração concluída: {len(sheet_data)} registros inseridos")
        
    def _insert_record(self, cursor, mapped_data):
        """Inserir um registro no banco"""
        columns = list(mapped_data.keys())
        placeholders = ['?' for _ in columns]
        values = list(mapped_data.values())
        
        cursor.execute(f'''
            INSERT INTO expenses ({', '.join(columns)})
            VALUES ({', '.join(placeholders)})
        ''', values)
        
    def get_column_mapping_from_headers(self, headers):
        """Mapear colunas baseado nos cabeçalhos do array"""
        mapping = {
            'expense_id': 'ID da Despesa',
            'report_id': 'ID do Relatório', 
            'report_name': 'Nome do relatório',
            'expense_date': 'Data',
            'member_name': 'COLABORADOR',
            'member_cpf': 'CPF',
            'bank': 'Banco',
            'agency': 'Agência',
            'account': 'Conta',
            'pix': 'PIX',
            'status': 'SITUAÇÃO',
            'payment_date': 'Data de Pagamento',
            'expense_description': 'Descrição da despesa',
            'expense_value': 'Valor',
            'cost_center': 'Centro de Custo',
            'project': 'Projeto',
            'category': 'Categoria',
            'approved_by': 'Aprovado por'
        }
        
        # Ajustar mapeamento baseado nos cabeçalhos reais
        actual_mapping = {}
        
        for db_col, header_name in mapping.items():
            if header_name in headers:
                actual_mapping[db_col] = header_name
                
        return actual_mapping
        
    def get_column_mapping(self, sample_row):
        """Mapear colunas do JSON para o banco"""
        mapping = {
            'expense_id': 'ID da Despesa',
            'report_id': 'ID do Relatório', 
            'report_name': 'Nome do relatório',
            'expense_date': 'Data',
            'member_name': 'Nome do membro de equipe',
            'member_cpf': 'CPF/CNPJ',
            'bank': 'Banco',
            'agency': 'Agência',
            'account': 'Conta',
            'pix': 'Pix',
            'status': 'Status',
            'payment_date': 'Data de Pagamento',
            'expense_description': 'Descrição da despesa',
            'expense_value': 'Valor',
            'cost_center': 'Centro de Custo',
            'project': 'Projeto',
            'category': 'Categoria',
            'approved_by': 'Aprovado por'
        }
        
        # Ajustar mapeamento baseado nas colunas reais
        actual_mapping = {}
        available_columns = list(sample_row.keys()) if sample_row else []
        
        for db_col, json_col in mapping.items():
            if json_col in available_columns:
                actual_mapping[db_col] = json_col
                
        return actual_mapping
        
    def get_sheet_info(self):
        """Obter informações das planilhas migradas"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT sheet_name, total_rows, file_size, processed_at
            FROM sheet_metadata
            ORDER BY processed_at DESC
        ''')
        
        return cursor.fetchall()
        
    def close(self):
        """Fechar conexão"""
        if self.conn:
            self.conn.close()

def main():
    """Função principal de migração"""
    migrator = DatabaseMigrator()
    
    try:
        migrator.connect()
        migrator.create_tables()
        
        # Migrar arquivos JSON disponíveis
        files_to_migrate = [
            ('../base_prest_2025_05_api.json', 'base_prest_2025_05'),
            ('../converted/carga_maio_2026.json', 'carga_maio_2026'),
            ('../converted/controle_maio_2026.json', 'controle_maio_2026')
        ]
        
        for json_path, sheet_name in files_to_migrate:
            if os.path.exists(json_path):
                migrator.migrate_json_file(json_path, sheet_name)
            else:
                print(f"⚠️ Arquivo não encontrado: {json_path}")
                
        # Mostrar resumo
        print("\n📋 Resumo da Migração:")
        for sheet in migrator.get_sheet_info():
            print(f"  📊 {sheet['sheet_name']}: {sheet['total_rows']:,} linhas ({sheet['file_size']:,} bytes)")
            
    except Exception as e:
        print(f"❌ Erro na migração: {e}")
        raise
    finally:
        migrator.close()

if __name__ == "__main__":
    main()
