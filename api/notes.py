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
                SELECT n.*, s.name as sector_name, s.color as sector_color, s.icon as sector_icon
                FROM notes n
                JOIN sectors s ON n.sector_key = s.key
                ORDER BY n.issue_date DESC
            ''')
            notes = cursor.fetchall()
            
            result = []
            for row in notes:
                result.append({
                    'id': row['id'],
                    'number': row['number'],
                    'value': float(row['value']),
                    'issueDate': row['issue_date'].isoformat() if row['issue_date'] else None,
                    'sectorKey': row['sector_key'],
                    'sector': row['sector_name'],
                    'status': row['status']
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
                INSERT INTO notes (number, value, issue_date, sector_key, status)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
            ''', (
                body['number'],
                body['value'],
                body['issueDate'],
                body['sectorKey'],
                body.get('status', 'pending')
            ))
            
            conn.commit()
            note = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({
                    'id': note['id'],
                    'number': note['number'],
                    'value': float(note['value']),
                    'issueDate': note['issue_date'].isoformat() if note['issue_date'] else None,
                    'sectorKey': note['sector_key'],
                    'status': note['status']
                })
            }
        
        elif method == 'PUT':
            body = json.loads(event.get('body', '{}'))
            note_id = path.split('/')[-1]
            
            cursor.execute('''
                UPDATE notes 
                SET number = %s, value = %s, issue_date = %s, sector_key = %s, status = %s
                WHERE id = %s
                RETURNING *
            ''', (
                body.get('number'),
                body.get('value'),
                body.get('issueDate'),
                body.get('sectorKey'),
                body.get('status'),
                note_id
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
            note_id = path.split('/')[-1]
            
            cursor.execute('DELETE FROM notes WHERE id = %s RETURNING id', (note_id,))
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
