import os
import json
from typing import List, Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor

# Configuração do banco de dados Neon
DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db_connection():
    """Cria conexão com o banco de dados Neon"""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def handler(event, context):
    """Handler para Vercel serverless function"""
    
    # Headers CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS para CORS
    if event.get('method') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    try:
        method = event.get('method', 'GET')
        path = event.get('path', '')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if method == 'GET':
            # GET /api/automations - Listar todas as automações
            cursor.execute('''
                SELECT a.*, s.name as sector_name, s.color as sector_color, s.icon as sector_icon
                FROM automations a
                JOIN sectors s ON a.sector_key = s.key
                ORDER BY a.id
            ''')
            automations = cursor.fetchall()
            
            # Converter para lista de dicts
            result = []
            for row in automations:
                result.append({
                    'id': row['id'],
                    'name': row['name'],
                    'sector': row['sector_name'],
                    'sectorKey': row['sector_key'],
                    'status': row['status'],
                    'running': row['running'],
                    'runtime': row['runtime'],
                    'description': row['description'],
                    'timeSaved': row['time_saved']
                })
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(result)
            }
        
        elif method == 'POST':
            # POST /api/automations - Criar nova automação
            body = json.loads(event.get('body', '{}'))
            
            cursor.execute('''
                INSERT INTO automations (name, sector_key, status, running, runtime, description, time_saved)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            ''', (
                body['name'],
                body['sectorKey'],
                body.get('status', 'active'),
                body.get('running', False),
                body.get('runtime', '--:--:--'),
                body.get('description', ''),
                body.get('timeSaved', 0)
            ))
            
            conn.commit()
            automation = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({
                    'id': automation['id'],
                    'name': automation['name'],
                    'sectorKey': automation['sector_key'],
                    'status': automation['status'],
                    'running': automation['running'],
                    'runtime': automation['runtime'],
                    'description': automation['description'],
                    'timeSaved': automation['time_saved']
                })
            }
        
        elif method == 'PUT':
            # PUT /api/automations/{id} - Atualizar automação
            body = json.loads(event.get('body', '{}'))
            automation_id = path.split('/')[-1]
            
            cursor.execute('''
                UPDATE automations 
                SET name = %s, sector_key = %s, status = %s, running = %s, runtime = %s, description = %s, time_saved = %s
                WHERE id = %s
                RETURNING *
            ''', (
                body.get('name'),
                body.get('sectorKey'),
                body.get('status'),
                body.get('running', False),
                body.get('runtime', '--:--:--'),
                body.get('description'),
                body.get('timeSaved', 0),
                automation_id
            ))
            
            conn.commit()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'success': True})
            }
        
        elif method == 'DELETE':
            # DELETE /api/automations/{id} - Deletar automação
            automation_id = path.split('/')[-1]
            
            cursor.execute('DELETE FROM automations WHERE id = %s RETURNING id', (automation_id,))
            conn.commit()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'success': True})
            }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }
