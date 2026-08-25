import openpyxl
import json

wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)

print("=" * 80)
print("EXTRACAO PAINEL PLANILHA - Comparacao com Banco")
print("=" * 80)

ws = wb['PAINEL']

# Row 11 has headers: EMPRESA, COLABORADORES, CPF, CHAVE, SITUACAO, STATUS CARTAO,
# CARTAO ITAU, TERMO, REGIONAL, CENTRO CUSTO, GESTOR, DIRETOR, CARTAO VEXPENSES,
# CARGA(13), TRANSFERENCIA(14), TARIFA(15), PRESTACAO(16), SALDO(17), ...
# Row 12+ has data

# Extract all PAINEL rows with key financial columns
painel_data = {}
for row in ws.iter_rows(min_row=12, values_only=True):
    if row[2] is None:
        continue
    cpf = str(row[2]).strip()
    nome = str(row[1]).strip() if row[1] else ''
    carga = float(row[13]) if row[13] else 0.0
    transf = float(row[14]) if row[14] else 0.0
    tarifa = float(row[15]) if row[15] else 0.0
    prestacao = float(row[16]) if row[16] else 0.0
    saldo = float(row[17]) if row[17] else 0.0
    
    painel_data[cpf] = {
        'nome': nome,
        'carga': carga,
        'transferencia': transf,
        'tarifa': tarifa,
        'prestacao': prestacao,
        'saldo': saldo,
    }

print(f"Total pessoas no PAINEL: {len(painel_data)}")

# Totals
total_carga = sum(v['carga'] for v in painel_data.values())
total_transf = sum(v['transferencia'] for v in painel_data.values())
total_tarifa = sum(v['tarifa'] for v in painel_data.values())
total_prest = sum(v['prestacao'] for v in painel_data.values())
total_saldo = sum(v['saldo'] for v in painel_data.values())

print(f"\nTOTAIS PAINEL PLANILHA:")
print(f"  Carga:         {total_carga:.2f}")
print(f"  Transferencia: {total_transf:.2f}")
print(f"  Tarifa:        {total_tarifa:.2f}")
print(f"  Prestacao:     {total_prest:.2f}")
print(f"  Saldo:         {total_saldo:.2f}")

# Save for comparison
with open('painel_planilha.json', 'w', encoding='utf-8') as f:
    json.dump({
        'totals': {
            'carga': total_carga,
            'transferencia': total_transf,
            'tarifa': total_tarifa,
            'prestacao': total_prest,
            'saldo': total_saldo,
        },
        'pessoas': len(painel_data),
        'data': painel_data,
    }, f, ensure_ascii=False, indent=2)

print("\nDados salvos em painel_planilha.json")

# Print some sample rows
print("\nAmostra (5 primeiras):")
for i, (cpf, v) in enumerate(list(painel_data.items())[:5]):
    print(f"  {cpf} - {v['nome'][:30]}: carga={v['carga']:.2f}, transf={v['transferencia']:.2f}, tarifa={v['tarifa']:.2f}, prest={v['prestacao']:.2f}, saldo={v['saldo']:.2f}")
