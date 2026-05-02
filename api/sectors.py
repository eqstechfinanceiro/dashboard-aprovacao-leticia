import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    }
    
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
            cursor.execute('SELECT * FROM sectors ORDER BY key')
            sectors = cursor.fetchall()
            
            result = []
            for row in sectors:
                result.append({
                    'key': row['key'],
                    'name': row['name'],
                    'color': row['color'],
                    'icon': row['icon']
                })
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(result)
            }
        
        elif method == 'POST':
            body = json.loads(event.get('body', '{}'))
            cursor.execute('''
                INSERT INTO sectors (key, name, color, icon)
                VALUES (%s, %s, %s, %s)
                RETURNING *
            ''', (body['key'], body['name'], body['color'], body['icon']))
            
            conn.commit()
            sector = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({
                    'key': sector['key'],
                    'name': sector['name'],
                    'color': sector['color'],
                    'icon': sector['icon']
                })
            }
        
        elif method == 'PUT':
            body = json.loads(event.get('body', '{}'))
            key = path.split('/')[-1]
            
            cursor.execute('''
                UPDATE sectors 
                SET name = %s, color = %s, icon = %s
                WHERE key = %s
                RETURNING *
            ''', (body['name'], body['color'], body['icon'], key))
            
            conn.commit()
            sector = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'key': sector['key'],
                    'name': sector['name'],
                    'color': sector['color'],
                    'icon': sector['icon']
                })
            }
        
        elif method == 'DELETE':
            key = path.split('/')[-1]
            
            cursor.execute('DELETE FROM sectors WHERE key = %s RETURNING key', (key,))
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
