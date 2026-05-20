import pandas as pd

# Ler planilha 1
print("=" * 80)
print("PLANILHA 1: 1QZ ABRIL 2026 - VEXPENSES (1).xlsx")
print("=" * 80)
df1 = pd.read_excel('1QZ ABRIL 2026 - VEXPENSES (1).xlsx', header=None)
print(f"\nShape: {df1.shape}")
print(f"\nPrimeiras 30 linhas (raw):")
for i in range(min(30, len(df1))):
    print(f"Linha {i}: {df1.iloc[i].dropna().to_dict()}")

# Ler planilha 2
print("\n\n" + "=" * 80)
print("PLANILHA 2: CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb")
print("=" * 80)
df2 = pd.read_excel('CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb', header=None)
print(f"\nShape: {df2.shape}")
print(f"\nPrimeiras 30 linhas (raw):")
for i in range(min(30, len(df2))):
    print(f"Linha {i}: {df2.iloc[i].dropna().to_dict()}")
