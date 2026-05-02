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
            cursor.execute('SELECT * FROM kpis')
            kpis = cursor.fetchall()
            
            result = {}
            for row in kpis:
                result[row['key']] = {
                    'value': row['value'],
                    'unit': row['unit'],
                    'changePercent': float(row['change_percent']) if row['change_percent'] else None,
                    'changePeriod': row['change_period']
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
                INSERT INTO kpis (key, value, unit, change_percent, change_period)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
            ''', (
                body['key'],
                body['value'],
                body.get('unit'),
                body.get('changePercent'),
                body.get('changePeriod')
            ))
            
            conn.commit()
            kpi = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({
                    'id': kpi['id'],
                    'key': kpi['key'],
                    'value': kpi['value'],
                    'unit': kpi['unit'],
                    'changePercent': float(kpi['change_percent']) if kpi['change_percent'] else None,
                    'changePeriod': kpi['change_period']
                })
            }
        
        elif method == 'PUT':
            body = json.loads(event.get('body', '{}'))
            kpi_id = path.split('/')[-1]
            
            cursor.execute('''
                UPDATE kpis 
                SET value = %s, unit = %s, change_percent = %s, change_period = %s
                WHERE id = %s
                RETURNING *
            ''', (
                body.get('value'),
                body.get('unit'),
                body.get('changePercent'),
                body.get('changePeriod'),
                kpi_id
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
            kpi_id = path.split('/')[-1]
            
            cursor.execute('DELETE FROM kpis WHERE id = %s RETURNING id', (kpi_id,))
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
