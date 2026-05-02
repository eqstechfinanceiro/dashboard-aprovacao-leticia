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
            cursor.execute('''
                SELECT t.*, 
                       COALESCE(
                           json_agg(
                               json_build_object(
                                   'text', ta.text,
                                   'done', ta.done
                               )
                           ) FILTER (WHERE ta.id IS NOT NULL), 
                           '[]'
                       ) as actions
                FROM timeline t
                LEFT JOIN timeline_actions ta ON t.id = ta.timeline_id
                GROUP BY t.id
                ORDER BY t.date DESC
            ''')
            timeline = cursor.fetchall()
            
            result = []
            for row in timeline:
                result.append({
                    'id': row['id'],
                    'date': row['date'],
                    'title': row['title'],
                    'description': row['description'],
                    'type': row['type'],
                    'sectorKey': row['sector_key'],
                    'sector': row['sector'],
                    'actions': row['actions']
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
                INSERT INTO timeline (date, title, description, type, sector_key, sector)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
            ''', (
                body['date'],
                body['title'],
                body.get('description', ''),
                body['type'],
                body['sectorKey'],
                body['sector']
            ))
            
            conn.commit()
            timeline_item = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({
                    'id': timeline_item['id'],
                    'date': timeline_item['date'],
                    'title': timeline_item['title'],
                    'description': timeline_item['description'],
                    'type': timeline_item['type'],
                    'sectorKey': timeline_item['sector_key'],
                    'sector': timeline_item['sector']
                })
            }
        
        elif method == 'PUT':
            body = json.loads(event.get('body', '{}'))
            timeline_id = path.split('/')[-1]
            
            cursor.execute('''
                UPDATE timeline 
                SET date = %s, title = %s, description = %s, type = %s, sector_key = %s, sector = %s
                WHERE id = %s
                RETURNING *
            ''', (
                body.get('date'),
                body.get('title'),
                body.get('description'),
                body.get('type'),
                body.get('sectorKey'),
                body.get('sector'),
                timeline_id
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
            timeline_id = path.split('/')[-1]
            
            cursor.execute('DELETE FROM timeline WHERE id = %s RETURNING id', (timeline_id,))
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
