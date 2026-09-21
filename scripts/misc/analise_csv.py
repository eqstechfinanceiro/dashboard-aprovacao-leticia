import pandas as pd
import traceback

try:
    # Ler o arquivo CSV
    file_path = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\resultados\comparacao_detalhada_20260615_201113.csv'
    df = pd.read_csv(file_path, encoding='utf-8')

    # Salvar resultado em arquivo de texto
    output_file = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\resultado_analise.txt'

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('=' * 100 + '\n')
        f.write('ANÁLISE DO ARQUIVO CSV - comparacao_detalhada_20260615_201113.csv\n')
        f.write('=' * 100 + '\n')

        # 1. Quantidade de linhas
        f.write(f'\n1. TOTAL DE LINHAS: {len(df)}\n')
        f.write(f'   Total de colunas: {len(df.columns)}\n')
        f.write(f'\n   Colunas: {list(df.columns)}\n')

        # 2. As 10 maiores diferenças de Saldo Cartão (diff_cartao)
        f.write('\n' + '=' * 100 + '\n')
        f.write('2. TOP 10 MAIORES DIFERENÇAS DE SALDO CARTÃO (diff_cartao)\n')
        f.write('=' * 100 + '\n')
        top_diff_cartao = df.nlargest(10, 'diff_cartao')[['nome_api', 'nome_controle', 'saldo_cartao_api', 'saldo_cartao_planilha', 'diff_cartao']]
        f.write(top_diff_cartao.to_string() + '\n')

        # 3. As 10 maiores diferenças de Saldo Final (diff_final)
        f.write('\n' + '=' * 100 + '\n')
        f.write('3. TOP 10 MAIORES DIFERENÇAS DE SALDO FINAL (diff_final)\n')
        f.write('=' * 100 + '\n')
        top_diff_final = df.nlargest(10, 'diff_final')[['nome_api', 'nome_controle', 'saldo_final_api', 'saldo_final_planilha', 'diff_final']]
        f.write(top_diff_final.to_string() + '\n')

        # 4. Análise detalhada das maiores diferenças - Saldo Cartão
        f.write('\n' + '=' * 100 + '\n')
        f.write('4. DETALHAMENTO TOP 5 MAIORES DIFERENÇAS - SALDO CARTÃO\n')
        f.write('=' * 100 + '\n')
        f.write('\nComparativo API vs Controle:\n')
        f.write('-' * 100 + '\n')
        for idx, row in df.nlargest(5, 'diff_cartao').iterrows():
            f.write(f'\n[Registro {idx}]\n')
            f.write(f'  Nome API:              {row["nome_api"]}\n')
            f.write(f'  Nome Controle:         {row["nome_controle"]}\n')
            f.write(f'  CPF:                   {row["cpf"]}\n')
            f.write(f'  Saldo Cartão API:      R$ {row["saldo_cartao_api"]:,.2f}\n')
            f.write(f'  Saldo Cartão Controle: R$ {row["saldo_cartao_planilha"]:,.2f}\n')
            f.write(f'  DIFERENÇA:             R$ {row["diff_cartao"]:,.2f}\n')

        # Análise detalhada das maiores diferenças - Saldo Final
        f.write('\n' + '=' * 100 + '\n')
        f.write('4b. DETALHAMENTO TOP 5 MAIORES DIFERENÇAS - SALDO FINAL\n')
        f.write('=' * 100 + '\n')
        f.write('\nComparativo API vs Controle:\n')
        f.write('-' * 100 + '\n')
        for idx, row in df.nlargest(5, 'diff_final').iterrows():
            f.write(f'\n[Registro {idx}]\n')
            f.write(f'  Nome API:              {row["nome_api"]}\n')
            f.write(f'  Nome Controle:         {row["nome_controle"]}\n')
            f.write(f'  CPF:                   {row["cpf"]}\n')
            f.write(f'  Saldo Final API:       R$ {row["saldo_final_api"]:,.2f}\n')
            f.write(f'  Saldo Final Controle:  R$ {row["saldo_final_planilha"]:,.2f}\n')
            f.write(f'  DIFERENÇA:             R$ {row["diff_final"]:,.2f}\n')

        # 5. Análise de similaridade dos nomes
        f.write('\n' + '=' * 100 + '\n')
        f.write('5. ANÁLISE DE PADRÃO - SIMILARIDADE DOS NOMES (API vs Controle)\n')
        f.write('=' * 100 + '\n')

        # Verificar se nomes são exatamente iguais
        nomes_iguais = df[df['nome_api'] == df['nome_controle']]
        f.write(f'\nNomes EXATAMENTE iguais: {len(nomes_iguais)} de {len(df)} ({len(nomes_iguais)/len(df)*100:.1f}%)\n')

        # Verificar nomes diferentes
        nomes_diferentes = df[df['nome_api'] != df['nome_controle']]
        f.write(f'Nomes DIFERENTES:        {len(nomes_diferentes)} de {len(df)} ({len(nomes_diferentes)/len(df)*100:.1f}%)\n')

        # Mostrar alguns exemplos de nomes diferentes (que têm grandes diferenças)
        f.write('\n' + '-' * 100 + '\n')
        f.write('Exemplos de nomes DIFERENTES com maiores diferenças de saldo:\n')
        f.write('-' * 100 + '\n')
        exemplos_nomes_diff = nomes_diferentes.nlargest(10, 'diff_cartao')[['nome_api', 'nome_controle', 'diff_cartao', 'diff_final']]
        f.write(exemplos_nomes_diff.to_string() + '\n')

        # Estatísticas gerais
        f.write('\n' + '=' * 100 + '\n')
        f.write('6. ESTATÍSTICAS GERAIS DAS DIFERENÇAS\n')
        f.write('=' * 100 + '\n')
        f.write('\n--- SALDO CARTÃO ---\n')
        f.write(f'Diferença média:    R$ {df["diff_cartao"].mean():,.2f}\n')
        f.write(f'Diferença mediana:  R$ {df["diff_cartao"].median():,.2f}\n')
        f.write(f'Diferença máxima:   R$ {df["diff_cartao"].max():,.2f}\n')
        f.write(f'Diferença mínima:   R$ {df["diff_cartao"].min():,.2f}\n')
        f.write(f'Desvio padrão:      R$ {df["diff_cartao"].std():,.2f}\n')

        f.write('\n--- SALDO FINAL ---\n')
        f.write(f'Diferença média:    R$ {df["diff_final"].mean():,.2f}\n')
        f.write(f'Diferença mediana:  R$ {df["diff_final"].median():,.2f}\n')
        f.write(f'Diferença máxima:   R$ {df["diff_final"].max():,.2f}\n')
        f.write(f'Diferença mínima:   R$ {df["diff_final"].min():,.2f}\n')
        f.write(f'Desvio padrão:      R$ {df["diff_final"].std():,.2f}\n')

        # Registros com diferença zero
        sem_diff_cartao = df[df['diff_cartao'] == 0]
        sem_diff_final = df[df['diff_final'] == 0]
        f.write('\n--- REGISTROS COM DIFERENÇA ZERO ---\n')
        f.write(f'Sem diferença no Saldo Cartão: {len(sem_diff_cartao)} ({len(sem_diff_cartao)/len(df)*100:.1f}%)\n')
        f.write(f'Sem diferença no Saldo Final:  {len(sem_diff_final)} ({len(sem_diff_final)/len(df)*100:.1f}%)\n')

        # Verificar se há padrão: diferenças grandes têm nomes diferentes?
        f.write('\n' + '=' * 100 + '\n')
        f.write('7. VERIFICAÇÃO DE PADRÃO: Diferenças grandes vs Nomes diferentes\n')
        f.write('=' * 100 + '\n')

        # Top 20 maiores diferenças de cartão
        top20_cartao = df.nlargest(20, 'diff_cartao')
        nomes_diferentes_top20 = top20_cartao[top20_cartao['nome_api'] != top20_cartao['nome_controle']]
        f.write(f'\nDos top 20 maiores diferenças de CARTÃO:\n')
        f.write(f'  - {len(nomes_diferentes_top20)} têm nomes diferentes ({len(nomes_diferentes_top20)/20*100:.0f}%)\n')
        f.write(f'  - {20-len(nomes_diferentes_top20)} têm nomes iguais ({(20-len(nomes_diferentes_top20))/20*100:.0f}%)\n')

        # Top 20 maiores diferenças de final
        top20_final = df.nlargest(20, 'diff_final')
        nomes_diferentes_top20f = top20_final[top20_final['nome_api'] != top20_final['nome_controle']]
        f.write(f'\nDos top 20 maiores diferenças de FINAL:\n')
        f.write(f'  - {len(nomes_diferentes_top20f)} têm nomes diferentes ({len(nomes_diferentes_top20f)/20*100:.0f}%)\n')
        f.write(f'  - {20-len(nomes_diferentes_top20f)} têm nomes iguais ({(20-len(nomes_diferentes_top20f))/20*100:.0f}%)\n')

        f.write('\n' + '=' * 100 + '\n')
        f.write('FIM DA ANÁLISE\n')
        f.write('=' * 100 + '\n')

    print('SUCESSO')
    print(f'Arquivo gerado: {output_file}')
except Exception as e:
    print(f'ERRO: {e}')
    traceback.print_exc()
