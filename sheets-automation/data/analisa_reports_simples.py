#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎯 ANÁLISE SIMPLES DE REPORTS - CORRELAÇÃO COM USUÁRIOS
"""

import json
import sys

def main():
    print("🎯 ANÁLISE DE REPORTS - ABRIL 2026")
    print("=" * 50)
    
    try:
        # Carregar dados dos reports
        with open('reports_jonas_abril_2026.json', 'r', encoding='utf-8') as f:
            dados = json.load(f)
        
        print(f"✅ Dados carregados com sucesso!")
        print(f"📊 Success: {dados.get('success')}")
        print(f"📋 Total reports: {len(dados.get('data', []))}")
        
        # Primeiros reports para análise
        reports = dados.get('data', [])
        
        if reports:
            print(f"\n🔍 ANÁLISE DOS PRIMEIROS 5 REPORTS:")
            print("-" * 50)
            
            for i, report in enumerate(reports[:5]):
                print(f"\n{i+1}. Report ID: {report.get('id')}")
                print(f"   User ID: {report.get('user_id')}")
                print(f"   Description: {report.get('description')}")
                print(f"   Status: {report.get('status')}")
                print(f"   Approval User ID: {report.get('approval_user_id')}")
                print(f"   Approval Date: {report.get('approval_date')}")
                print(f"   Payment Method ID: {report.get('payment_method_id')}")
                print(f"   Created: {report.get('created_at')}")
                
                # Observações e justificativas
                obs = report.get('observation', '')
                just = report.get('justification', '')
                
                if obs:
                    print(f"   Observation: {obs[:100]}...")
                if just:
                    print(f"   Justification: {just[:100]}...")
        
        # Contagem por status
        status_count = {}
        for report in reports:
            status = report.get('status', 'Unknown')
            status_count[status] = status_count.get(status, 0) + 1
        
        print(f"\n📊 CONTAGEM POR STATUS:")
        print("-" * 30)
        for status, count in sorted(status_count.items()):
            print(f"   {status}: {count}")
        
        # Contagem por approval_user_id
        approval_count = {}
        for report in reports:
            approval_id = report.get('approval_user_id')
            if approval_id:
                approval_count[approval_id] = approval_count.get(approval_id, 0) + 1
        
        print(f"\n👥 GESTORES ENVOLVIDOS (Top 10):")
        print("-" * 40)
        for approval_id, count in sorted(approval_count.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"   User ID {approval_id}: {count} aprovações")
        
        # Mapeamento de gestores conhecidos
        gestores_map = {
            "896113": "FERNANDA ARAGÃO LOPES",
            "895948": "ADILSON RODRIGUES FERREIRA", 
            "896397": "THIAGO NEVES DE FREITAS"
        }
        
        print(f"\n🎯 GESTORES IDENTIFICADOS:")
        print("-" * 30)
        for approval_id, count in approval_count.items():
            if str(approval_id) in gestores_map:
                nome = gestores_map[str(approval_id)]
                print(f"   ✅ {nome} ({approval_id}): {count} aprovações")
        
        # Salvar análise simplificada
        resultado = {
            "total_reports": len(reports),
            "status_count": status_count,
            "approval_count": approval_count,
            "gestores_identificados": {
                gid: {"nome": nome, "aprovacoes": approval_count.get(int(gid), 0)}
                for gid, nome in gestores_map.items()
                if int(gid) in approval_count
            }
        }
        
        with open('analise_reports_simplificada.json', 'w', encoding='utf-8') as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        
        print(f"\n💾 Análise salva em: analise_reports_simplificada.json")
        
    except Exception as e:
        print(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()