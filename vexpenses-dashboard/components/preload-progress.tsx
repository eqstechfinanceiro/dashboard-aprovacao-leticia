'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

interface PreloadTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  results: Array<{
    period: string;
    cacheKey: string;
    success: boolean;
    duration: number;
    recordCount: number;
  }>;
}

export function PreloadProgress() {
  const [tasks, setTasks] = useState<PreloadTask[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);

  // Buscar status das tasks periodicamente
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const response = await fetch('/api/preload');
        const data = await response.json();
        setTasks(data.tasks || []);
        
        // Verificar se há alguma task rodando
        const runningTask = data.tasks?.find((t: PreloadTask) => t.status === 'running');
        setIsPreloading(!!runningTask);
      } catch (error) {
        console.error('Erro ao buscar tasks:', error);
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 2000); // Atualizar a cada 2 segundos

    return () => clearInterval(interval);
  }, []);

  const startPreload = async (startDate: string, endDate: string) => {
    try {
      setIsPreloading(true);
      const response = await fetch('/api/preload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });

      if (!response.ok) {
        throw new Error('Falha ao iniciar pré-carregamento');
      }

      const data = await response.json();
      console.log('Pré-carregamento iniciado:', data);
    } catch (error) {
      console.error('Erro ao iniciar pré-carregamento:', error);
      setIsPreloading(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  const getStatusIcon = (status: PreloadTask['status']) => {
    switch (status) {
      case 'running':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const activeTask = tasks.find(t => t.status === 'running' || t.status === 'pending');

  if (!showDetails && !activeTask) {
    return (
      <div className="mb-4">
        <Button
          onClick={() => setShowDetails(true)}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Gerenciar Cache
        </Button>
      </div>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Gerenciamento de Cache</CardTitle>
          <Button
            onClick={() => setShowDetails(!showDetails)}
            variant="ghost"
            size="sm"
            className="text-xs"
          >
            {showDetails ? 'Ocultar' : 'Detalhes'}
          </Button>
        </div>
      </CardHeader>
      {showDetails && (
        <CardContent className="space-y-3">
          {/* Botões de pré-carregamento rápido */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                startPreload(start, end);
              }}
              disabled={isPreloading}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              Mês Atual
            </Button>
            <Button
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), Math.max(0, now.getMonth() - 2), 1).toISOString().split('T')[0];
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                startPreload(start, end);
              }}
              disabled={isPreloading}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              Últimos 3 Meses
            </Button>
            <Button
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), Math.max(0, now.getMonth() - 5), 1).toISOString().split('T')[0];
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                startPreload(start, end);
              }}
              disabled={isPreloading}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              Últimos 6 Meses
            </Button>
          </div>

          {/* Task ativa */}
          {activeTask && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(activeTask.status)}
                <span className="text-sm font-medium">{activeTask.currentStep}</span>
              </div>
              
              {/* Barra de progresso */}
              <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${activeTask.progress}%` }}
                />
              </div>
              
              <div className="flex justify-between text-xs text-gray-600">
                <span>{activeTask.completedSteps}/{activeTask.totalSteps} meses</span>
                <span>{activeTask.progress}%</span>
              </div>

              {/* Detalhes dos meses carregados */}
              {activeTask.results.length > 0 && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {activeTask.results.map((result, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        {result.success ? (
                          <CheckCircle className="h-3 w-3 text-green-600" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-600" />
                        )}
                        {result.period}
                      </span>
                      <span className="text-gray-500">
                        {result.recordCount} regs ({formatDuration(result.duration)})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tasks concluídas */}
          {tasks.filter(t => t.status === 'completed' || t.status === 'failed').length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-700">Histórico Recente</h4>
              {tasks
                .filter(t => t.status === 'completed' || t.status === 'failed')
                .slice(0, 3)
                .map((task) => (
                  <div key={task.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(task.status)}
                      <span>{task.completedSteps}/{task.totalSteps} meses</span>
                    </div>
                    <span className="text-gray-500">
                      {task.completedAt ? new Date(task.completedAt).toLocaleTimeString() : '-'}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
