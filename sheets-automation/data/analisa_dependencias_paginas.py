#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔍 ANÁLISE DE DEPENDÊNCIAS ENTRE PÁGINAS
Determina a ordem de execução para preenchimento automático
"""

import json
import re
import os
from collections import defaultdict

def extrair_referencias_paginas(formula):
    """Extrai referências a outras páginas de uma fórmula"""
    # Padrão para capturar nomes de páginas seguidos de !
    # Ex: EXTRATO!L:L, QUINZENAS[VALOR], 'BASE PREST '!J:J
    padroes = [
        r'([A-ZÁÉÍÓÚÀÃÕÂÊÎÔÛÇ\s]+)!',  # PAGINA!
        r'([A-ZÁÉÍÓÚÀÃÕÂÊÎÔÛÇ\s]+)\[',  # PAGINA[
    ]
    
    paginas = set()
    for padrao in padroes:
        matches = re.findall(padrao, formula)
        for match in matches:
            # Limpar e normalizar o nome da página
            pagina = match.strip().strip("'")
            if pagina and pagina != 'PAINEL':  # Ignorar auto-referência
                paginas.add(pagina)
    
    return paginas

def analisar_dependencias():
    """Analisa as dependências entre páginas"""
    
    print("🔍 ANALISANDO DEPENDÊNCIAS ENTRE PÁGINAS")
    print("=" * 60)
    
    # Carregar arquivo de fórmulas
    with open('../formulas_controle.json', 'r', encoding='utf-8') if os.path.exists('../formulas_controle.json') else open('formulas_controle.json', 'r', encoding='utf-8') as f:
        formulas_data = json.load(f)
    
    # Criar grafo de dependências
    grafo = defaultdict(set)
    todas_paginas = set(formulas_data.keys())
    
    # Analisar cada página
    for pagina, linhas in formulas_data.items():
        if not linhas:
            continue
        
        dependencias = set()
        
        # Analisar cada linha com fórmulas
        for linha in linhas:
            if not linha:
                continue
            
            for celula in linha:
                if celula and isinstance(celula, dict) and 'formula' in celula:
                    refs = extrair_referencias_paginas(celula['formula'])
                    dependencias.update(refs)
        
        # Adicionar dependências ao grafo (ignorar auto-referências)
        for dep in dependencias:
            if dep in todas_paginas and dep != pagina:
                grafo[pagina].add(dep)
    
    # Imprimir grafo de dependências
    print("\n📊 GRAFO DE DEPENDÊNCIAS:")
    print("-" * 60)
    for pagina in sorted(grafo.keys()):
        deps = sorted(grafo[pagina])
        if deps:
            print(f"{pagina:30} → {', '.join(deps)}")
        else:
            print(f"{pagina:30} → (sem dependências)")
    
    # Páginas sem dependências (podem ser preenchidas primeiro)
    paginas_sem_deps = [p for p in todas_paginas if p not in grafo or not grafo[p]]
    print(f"\n✅ PÁGINAS SEM DEPENDÊNCIAS ({len(paginas_sem_deps)}):")
    for p in sorted(paginas_sem_deps):
        print(f"   - {p}")
    
    # Topological sort simplificado (ordem de execução)
    print(f"\n🔄 ORDEM SUGERIDA DE EXECUÇÃO:")
    print("-" * 60)
    
    ordem = []
    visitados = set()
    
    def visitar(pagina, caminho):
        if pagina in visitados:
            return
        if pagina in caminho:
            print(f"⚠️  CICLO DETECTADO: {' → '.join(caminho + [pagina])}")
            return
        
        caminho.append(pagina)
        
        # Visitar dependências primeiro
        if pagina in grafo and grafo[pagina]:
            for dep in sorted(grafo[pagina]):
                if dep in todas_paginas:
                    visitar(dep, caminho)
        
        visitados.add(pagina)
        if pagina not in ordem:
            ordem.append(pagina)
        
        caminho.pop()
    
    # Visitar todas as páginas
    for pagina in sorted(todas_paginas):
        visitar(pagina, [])
    
    # Imprimir ordem final
    for i, pagina in enumerate(ordem, 1):
        deps = grafo.get(pagina, set())
        if deps:
            deps_str = ', '.join(sorted(deps))
            print(f"{i:2}. {pagina:30} (depende de: {deps_str})")
        else:
            print(f"{i:2}. {pagina:30} (pode ser preenchida diretamente da API)")
    
    # Resumo
    print(f"\n📋 RESUMO:")
    print(f"   Total de páginas: {len(todas_paginas)}")
    print(f"   Páginas sem dependências: {len(paginas_sem_deps)}")
    print(f"   Páginas com dependências: {len([p for p in todas_paginas if p in grafo and grafo[p]])}")
    
    # Identificar páginas que são fontes de dados (não são referenciadas por outras)
    referenciadas = set()
    for deps in grafo.values():
        referenciadas.update(deps)
    
    fontes_dados = [p for p in todas_paginas if p not in referenciadas]
    print(f"   Páginas fontes de dados (não referenciadas): {len(fontes_dados)}")
    for p in sorted(fontes_dados):
        print(f"      - {p}")
    
    return ordem, grafo

if __name__ == "__main__":
    ordem, grafo = analisar_dependencias()
