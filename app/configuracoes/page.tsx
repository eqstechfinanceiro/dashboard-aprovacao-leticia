'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle, Zap, Calendar } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { UsersManagement } from '@/components/users-management';

interface StepInfo {
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

interface PipelineStatus {
  quinzena: string;
  complete: boolean;
  steps: Record<string, StepInfo>;
  current_quinzena: string;
}

const STEP_LABELS: Record<string, string> = {
  download_extrato: 'Download Extrato',
  refresh_cadastro: 'Atualizar Cadastro',
  refresh_reports: 'Atualizar Relatórios',
  download_expenses: 'Baixar Despesas',
  snapshot_somase: 'Snapshot Somase',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  download_extrato: 'Baixa extrato de cartões via API v3 (XLSX) e grava no Neon',
  refresh_cadastro: 'Busca dados cadastrais (nome, regional, gestor) da API v2 team-members',
  refresh_reports: 'Baixa todos os relatórios da API e atualiza status (APROVADO, ENVIADO, etc.)',
  download_expenses: 'Baixa todas as despesas dos relatórios do VExpenses',
  snapshot_somase: 'Cria snapshot do somase acumulado por CPF para a quinzena atual',
};

const STEP_ORDER = ['download_extrato', 'refresh_cadastro', 'refresh_reports', 'download_expenses', 'snapshot_somase'];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-600" />;
    case 'running':
      return <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />;
    case 'pending':
      return <Clock className="h-5 w-5 text-gray-400" />;
    case 'skipped':
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    default:
      return <Clock className="h-5 w-5 text-gray-400" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    running: 'bg-blue-100 text-blue-800 border-blue-200',
    pending: 'bg-gray-100 text-gray-600 border-gray-200',
    skipped: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };
  const labels: Record<string, string> = {
    success: 'Concluído',
    failed: 'Falhou',
    running: 'Executando',
    pending: 'Pendente',
    skipped: 'Pulado',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
}

export default function Configuracoes() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ success: boolean; message: string } | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>('');

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/pipeline/status');
      if (resp.ok) {
        const data = await resp.json();
        setPipelineStatus(data);
      }
    } catch (err) {
      console.error('Error fetching pipeline status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const runPipeline = async () => {
    setRunning(true);
    setRunResult(null);
    setProgressMsg('Iniciando pipeline...');

    try {
      const resp = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual' }),
      });
      const data = await resp.json();

      if (data.success) {
        setRunResult({ success: true, message: 'Pipeline executado com sucesso! Somase snapshotado para a quinzena.' });
      } else {
        const failedStep = Object.entries(data.results || {}).find(([, v]: any) => v.error);
        setRunResult({
          success: false,
          message: `Pipeline falhou${failedStep ? ` na etapa: ${STEP_LABELS[failedStep[0]] || failedStep[0]}` : ''}. ${failedStep ? (failedStep[1] as any).error : ''}`,
        });
      }
      fetchStatus();
    } catch (err) {
      setRunResult({ success: false, message: err instanceof Error ? err.message : 'Erro desconhecido' });
    } finally {
      setRunning(false);
      setProgressMsg('');
    }
  };

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

  const quinzena = pipelineStatus?.quinzena || '-';
  const isComplete = pipelineStatus?.complete || false;
  const hasSteps = pipelineStatus && Object.keys(pipelineStatus.steps).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-600 mt-1">Configurações do sistema (Admin)</p>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          {user?.role === 'admin' && (
            <TabsTrigger value="users">Usuários</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="pipeline">
      {/* Pipeline Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle>Pipeline de Fechamento Automático</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Executa automaticamente nos dias 10 e 25 de cada mês às 02:00
                </p>
              </div>
            </div>
            {isComplete ? (
              <StatusBadge status="success" />
            ) : hasSteps ? (
              <StatusBadge status="running" />
            ) : (
              <StatusBadge status="pending" />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quinzena info */}
          <div className="flex items-center gap-2 text-sm bg-blue-50 rounded-lg p-3">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="text-blue-900">
              Quinzena atual: <strong>{quinzena}</strong>
            </span>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {STEP_ORDER.map((step) => {
              const stepInfo = pipelineStatus?.steps[step];
              const status = stepInfo?.status || 'pending';
              return (
                <div key={step} className="flex items-start gap-3 p-3 border rounded-lg">
                  <StatusIcon status={status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{STEP_LABELS[step]}</span>
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{STEP_DESCRIPTIONS[step]}</p>
                    {stepInfo?.started_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        Início: {formatDate(stepInfo.started_at)}
                        {stepInfo.finished_at && ` | Fim: ${formatDate(stepInfo.finished_at)}`}
                      </p>
                    )}
                    {stepInfo?.error && (
                      <p className="text-xs text-red-600 mt-1 font-mono">{stepInfo.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Run result */}
          {runResult && (
            <div className={`p-3 rounded-lg text-sm ${runResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {runResult.message}
            </div>
          )}

          {/* Progress */}
          {running && progressMsg && (
            <div className="p-3 rounded-lg text-sm bg-blue-50 text-blue-800 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {progressMsg}
            </div>
          )}

          {/* Action button */}
          <div className="flex gap-3">
            <Button
              onClick={runPipeline}
              disabled={running}
              className="flex items-center gap-2"
            >
              {running ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {running ? 'Executando...' : 'Executar Pipeline Agora'}
            </Button>
            <Button
              onClick={fetchStatus}
              variant="outline"
              disabled={running}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar Status
            </Button>
          </div>

          {/* Cron info */}
          <div className="text-xs text-gray-500 border-t pt-3 mt-3">
            <p className="font-medium mb-1">Automação:</p>
            <p>
              O pipeline é executado automaticamente nos dias <strong>10 e 25</strong> de cada mês às 02:00.
              Para configurar o cron externo, use o endpoint:
            </p>
            <code className="block mt-1 p-2 bg-gray-100 rounded text-xs">
              GET /api/pipeline/cron
            </code>
            <p className="mt-1">
              Configure no <a href="https://cron-job.org" target="_blank" rel="noopener" className="text-blue-600 underline">cron-job.org</a> com schedule: <code>0 2 10,25 * *</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Existing config cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer opacity-60">
          <CardHeader>
            <CardTitle>Fluxos de Aprovação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Configurar fluxos de aprovação de despesas</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer opacity-60">
          <CardHeader>
            <CardTitle>Centros de Custo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Gerenciar centros de custo</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer opacity-60">
          <CardHeader>
            <CardTitle>Projetos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Gerenciar projetos</p>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        {user?.role === 'admin' && (
          <TabsContent value="users">
            <UsersManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
