'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings } from 'lucide-react';

export default function Configuracoes() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 1000);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-600 mt-1">Configurações do sistema (Admin)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle>Fluxos de Aprovação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Configurar fluxos de aprovação de despesas</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle>Centros de Custo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Gerenciar centros de custo</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle>Projetos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Gerenciar projetos</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle>Tipos de Despesa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Gerenciar categorias de despesas</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle>Membros da Equipe</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Gerenciar usuários e permissões</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle>Limites de Despesa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Configurar limites por usuário/centro</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurações Gerais</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">Formulários de configuração (a implementar)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
