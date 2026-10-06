"""Deploy F1 conferencia-mercadoria → VPS (worker files + SIEG env + cookies)."""
import paramiko, os

HOST, USER, PASS = '179.199.149.43', 'root', 'EQSeng80464@'
BASE_LOCAL = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\vexpenses-dashboard'
BASE_REMOTE = '/var/www/dashboard-financeiro/vexpenses-dashboard'

UPLOADS = [
    ('lib/conferencia/totvs.ts',       'lib/conferencia/totvs.ts'),
    ('lib/conferencia/comparator.ts',  'lib/conferencia/comparator.ts'),
    ('lib/conferencia/xml-parser.ts',  'lib/conferencia/xml-parser.ts'),
    ('lib/conferencia/tes-rules.ts',   'lib/conferencia/tes-rules.ts'),
    ('lib/conferencia/sieg.ts',        'lib/conferencia/sieg.ts'),
    ('lib/conferencia/fontes.ts',      'lib/conferencia/fontes.ts'),
    ('lib/conferencia/zip.ts',         'lib/conferencia/zip.ts'),
    ('lib/conferencia/sync.ts',        'lib/conferencia/sync.ts'),
    ('worker/sync-worker.ts',          'worker/sync-worker.ts'),
    ('worker-dist/lib/conferencia/totvs.js',      'worker-dist/lib/conferencia/totvs.js'),
    ('worker-dist/lib/conferencia/comparator.js', 'worker-dist/lib/conferencia/comparator.js'),
    ('worker-dist/lib/conferencia/xml-parser.js', 'worker-dist/lib/conferencia/xml-parser.js'),
    ('worker-dist/lib/conferencia/tes-rules.js',  'worker-dist/lib/conferencia/tes-rules.js'),
    ('worker-dist/lib/conferencia/sieg.js',       'worker-dist/lib/conferencia/sieg.js'),
    ('worker-dist/lib/conferencia/fontes.js',     'worker-dist/lib/conferencia/fontes.js'),
    ('worker-dist/lib/conferencia/zip.js',        'worker-dist/lib/conferencia/zip.js'),
    ('worker-dist/lib/conferencia/sync.js',       'worker-dist/lib/conferencia/sync.js'),
    ('worker-dist/worker/sync-worker.js',         'worker-dist/worker/sync-worker.js'),
]

COOKIES_LOCAL = r'C:\Users\italo.medrado\Desktop\Projects\Letícia\conferencia-notas-mercadoria\sieg_cookies.json'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=20)
sftp = c.open_sftp()

def run(cmd):
    i, o, e = c.exec_command(cmd)
    out = o.read().decode(); err = e.read().decode()
    return out, err

run(f'mkdir -p {BASE_REMOTE}/lib/conferencia {BASE_REMOTE}/worker {BASE_REMOTE}/worker-dist/lib/conferencia {BASE_REMOTE}/private-downloads/fiscal')

for local, remote in UPLOADS:
    sftp.put(os.path.join(BASE_LOCAL, local), f'{BASE_REMOTE}/{remote}')
    print('up', remote)

# Cookies SIEG — bootstrap pra não depender do login no 1º ciclo
if os.path.exists(COOKIES_LOCAL):
    sftp.put(COOKIES_LOCAL, f'{BASE_REMOTE}/private-downloads/sieg_cookies.json')
    print('up private-downloads/sieg_cookies.json')

# SIEG envs — append só se ausentes (valores vêm do sieg_handler.py)
out, _ = run(f'grep -c SIEG_ {BASE_REMOTE}/.env.local || true')
if 'SIEG_EMAIL' not in out:
    run("printf '\\nSIEG_EMAIL=italo.medrado@eqsengenharia.com.br\\nSIEG_SENHA=EQSeng4292@\\n' >> " + BASE_REMOTE + '/.env.local')
    print('env: SIEG_EMAIL/SIEG_SENHA adicionados')
else:
    print('env: SIEG_* já presentes')

sftp.close()
# Limpa o diretório errado criado na 1ª tentativa (só contém uploads deste deploy)
out, _ = run('test -d /var/www/vexpenses-dashboard && find /var/www/vexpenses-dashboard -type f | wc -l')
print('stray dir files:', out.strip())
out, err = run(f'pm2 restart sync-worker --update-env && sleep 2 && pm2 list | grep -E "sync-worker|dashboard-financeiro"')
print(out[-2500:]); print(err[-800:])
c.close()
print(out[-2500:]); print(err[-800:])
c.close()
