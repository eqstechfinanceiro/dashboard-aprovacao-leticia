import os
import glob

# Verificar se há algum backup do expenses.json
data_dir = "data"
if os.path.exists(data_dir):
    files = glob.glob(os.path.join(data_dir, "expenses*.json"))
    print(f"Arquivos expenses encontrados em {data_dir}:")
    for f in files:
        size = os.path.getsize(f)
        print(f"  {f}: {size:,} bytes ({size/1024/1024:.2f} MB)")
else:
    print(f"Diretório {data_dir} não existe")
