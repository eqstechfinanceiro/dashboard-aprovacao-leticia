import subprocess, sys, os
os.environ['PYTHONIOENCODING'] = 'utf-8'
script = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\src\import_cadastro_july.py'
out = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\cadastro_import.txt'
with open(out, 'w', encoding='utf-8') as fh:
    proc = subprocess.run([sys.executable, script], stdout=fh, stderr=subprocess.STDOUT, env=os.environ)
print('Exit code:', proc.returncode)
