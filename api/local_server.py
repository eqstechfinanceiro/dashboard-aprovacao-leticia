import os
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Carregar variáveis de ambiente do arquivo .env
load_dotenv()

app = Flask(__name__, static_folder='../static', static_url_path='/static')
CORS(app)

# Usar connection string direta do Neon temporariamente
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://neondb_owner:npg_HRTpxwemQ40Y@ep-patient-shadow-acgn0exr-pooler.sa-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require')

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

# Serve static files
@app.route('/')
def index():
    return send_from_directory('..', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if path.endswith('.html'):
        return send_from_directory('..', path)
    return send_from_directory('../static', path)

@app.route('/api/automations', methods=['GET', 'POST', 'OPTIONS'])
def handle_automations():
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        cursor.execute('''
            SELECT a.*, s.name as sector_name, s.color as sector_color, s.icon as sector_icon
            FROM automations a
            JOIN sectors s ON a.sector_key = s.key
            ORDER BY a.id
        ''')
        automations = cursor.fetchall()
        
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
        
        return jsonify(result)
    
    elif request.method == 'POST':
        body = request.get_json()
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
        
        return jsonify({
            'id': automation['id'],
            'name': automation['name'],
            'sectorKey': automation['sector_key'],
            'status': automation['status'],
            'running': automation['running'],
            'runtime': automation['runtime'],
            'description': automation['description'],
            'timeSaved': automation['time_saved']
        }), 201

@app.route('/api/automations/<int:id>', methods=['PUT', 'DELETE', 'OPTIONS'])
def handle_automation(id):
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        body = request.get_json()
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
            id
        ))
        
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM automations WHERE id = %s RETURNING id', (id,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})

@app.route('/api/sectors', methods=['GET', 'POST', 'OPTIONS'])
def handle_sectors():
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
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
        
        return jsonify(result)
    
    elif request.method == 'POST':
        body = request.get_json()
        cursor.execute('''
            INSERT INTO sectors (key, name, color, icon)
            VALUES (%s, %s, %s, %s)
            RETURNING *
        ''', (body['key'], body['name'], body['color'], body['icon']))
        
        conn.commit()
        sector = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'key': sector['key'],
            'name': sector['name'],
            'color': sector['color'],
            'icon': sector['icon']
        }), 201

@app.route('/api/sectors/<string:key>', methods=['PUT', 'DELETE', 'OPTIONS'])
def handle_sector(key):
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        body = request.get_json()
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
        
        return jsonify({
            'key': sector['key'],
            'name': sector['name'],
            'color': sector['color'],
            'icon': sector['icon']
        })
    
    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM sectors WHERE key = %s RETURNING key', (key,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})

@app.route('/api/timeline', methods=['GET', 'POST', 'OPTIONS'])
def handle_timeline():
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
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
        
        return jsonify(result)
    
    elif request.method == 'POST':
        body = request.get_json()
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
        
        return jsonify({
            'id': timeline_item['id'],
            'date': timeline_item['date'],
            'title': timeline_item['title'],
            'description': timeline_item['description'],
            'type': timeline_item['type'],
            'sectorKey': timeline_item['sector_key'],
            'sector': timeline_item['sector']
        }), 201

@app.route('/api/timeline/<int:id>', methods=['PUT', 'DELETE', 'OPTIONS'])
def handle_timeline_item(id):
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        body = request.get_json()
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
            id
        ))
        
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM timeline WHERE id = %s RETURNING id', (id,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})

@app.route('/api/kpis', methods=['GET', 'POST', 'OPTIONS'])
def handle_kpis():
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
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
        
        return jsonify(result)
    
    elif request.method == 'POST':
        body = request.get_json()
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
        
        return jsonify({
            'id': kpi['id'],
            'key': kpi['key'],
            'value': kpi['value'],
            'unit': kpi['unit'],
            'changePercent': float(kpi['change_percent']) if kpi['change_percent'] else None,
            'changePeriod': kpi['change_period']
        }), 201

@app.route('/api/kpis/<int:id>', methods=['PUT', 'DELETE', 'OPTIONS'])
def handle_kpi(id):
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        body = request.get_json()
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
            id
        ))
        
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM kpis WHERE id = %s RETURNING id', (id,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})

@app.route('/api/chart_data', methods=['GET', 'POST', 'OPTIONS'])
def handle_chart_data():
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
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
        
        return jsonify(result)
    
    elif request.method == 'POST':
        body = request.get_json()
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
        
        return jsonify({
            'id': chart['id'],
            'period': chart['period'],
            'labels': chart['labels'],
            'data': chart['data']
        }), 201

@app.route('/api/chart_data/<int:id>', methods=['PUT', 'DELETE', 'OPTIONS'])
def handle_chart_data_item(id):
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        body = request.get_json()
        cursor.execute('''
            UPDATE chart_data 
            SET labels = %s, data = %s
            WHERE id = %s
            RETURNING *
        ''', (
            body.get('labels'),
            body.get('data'),
            id
        ))
        
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM chart_data WHERE id = %s RETURNING id', (id,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})

@app.route('/api/notes', methods=['GET', 'POST', 'OPTIONS'])
def handle_notes():
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
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
        
        return jsonify(result)
    
    elif request.method == 'POST':
        body = request.get_json()
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
        
        return jsonify({
            'id': note['id'],
            'number': note['number'],
            'value': float(note['value']),
            'issueDate': note['issue_date'].isoformat() if note['issue_date'] else None,
            'sectorKey': note['sector_key'],
            'status': note['status']
        }), 201

@app.route('/api/notes/<int:id>', methods=['PUT', 'DELETE', 'OPTIONS'])
def handle_note(id):
    if request.method == 'OPTIONS':
        return '', 200
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        body = request.get_json()
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
            id
        ))
        
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})
    
    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM notes WHERE id = %s RETURNING id', (id,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
