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
            cursor.execute('SELECT * FROM chart_data ORDER BY period')
            chart_data = cursor.fetchall()
            
            result = {}
            for row in chart_data:
                result[row['period']] = {
                    'labels': row['labels'],
                    'data': row['data']
                }
            
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
                INSERT INTO chart_data (period, labels, data)
                VALUES (%s, %s, %s)
                RETURNING *
            ''', (
                body['period'],
                body['labels'],
                body['data']
            ))
            
            conn.commit()
            chart = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({
                    'id': chart['id'],
                    'period': chart['period'],
                    'labels': chart['labels'],
                    'data': chart['data']
                })
            }
        
        elif method == 'PUT':
            body = json.loads(event.get('body', '{}'))
            chart_id = path.split('/')[-1]
            
            cursor.execute('''
                UPDATE chart_data 
                SET labels = %s, data = %s
                WHERE id = %s
                RETURNING *
            ''', (
                body.get('labels'),
                body.get('data'),
                chart_id
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
            chart_id = path.split('/')[-1]
            
            cursor.execute('DELETE FROM chart_data WHERE id = %s RETURNING id', (chart_id,))
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
