'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PlanilhaRow {
  colaborador: string;
  cpf: string;
  situacao: string;
  regional: string;
  centroCusto: string;
  gestor: string;
  diretor: string;
  saldoReembolsar: number;
  saldoReembolsar_source: string;
  saldoFinal: number;
  saldoFinal_source: string;
  primeiraQZ: number;
  primeiraQZ_source: string;
  saldoCartao: number;
  saldoCartao_source: string;
  adiantamento: number;
  adiantamento_source: string;
  cargaParcial: number;
  reembolso: number;
  cargaFinal: number;
  obs: string;
  statusCartao: string;
  userId: number;
}

interface Stats {
  total_users: number;
  processed_users: number;
  total_expenses: number;
  total_reports: number;
  period: {
    year: number;
    month: number;
    quinzena: number;
    start_date: string;
    end_date: string;
  };
  sources: Record<string, string>;
}

export default function PlanilhaAutomacaoPage() {
  const searchParams = useSearchParams();
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);
  const [quinzena, setQuinzena] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<PlanilhaRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPlanilha() {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/vexpenses/planilha-completa?year=${year}&month=${month}&quinzena=${quinzena}&limit=${limit}`;
      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Erro ao buscar dados');
      }

      setData(result.data);
      setStats(result.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  // Buscar automaticamente ao montar
  useEffect(() => {
    fetchPlanilha();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getSourceBadge = (source: string) => {
    if (source.includes('api')) {
      return <Badge className="bg-green-500">API</Badge>;
    }
    if (source.includes('formula')) {
      return <Badge className="bg-blue-500">FÓRMULA</Badge>;
    }
    if (source.includes('pattern')) {
      return <Badge className="bg-yellow-500">PADRÃO</Badge>;
    }
    if (source.includes('not_available') || source.includes('placeholder')) {
      return <Badge className="bg-red-500">NÃO DISPONÍVEL</Badge>;
    }
    if (source.includes('hardcoded')) {
      return <Badge className="bg-purple-500">HARDCODED</Badge>;
    }
    return <Badge className="bg-gray-500">{source}</Badge>;
  };

  // Verificar se há dados que NÃO vieram da API (não-automatizados)
  const nonAutomatedFields = useMemo(() => {
    if (!data) return [];
    const fields: string[] = [];

    const hasNonApiSaldoReembolsar = data.some(
      (r) => !r.saldoReembolsar_source.includes('api')
    );
    const hasNonApiSaldoFinal = data.some((r) => !r.saldoFinal_source.includes('api'));
    const hasNonApiAdiantamento = data.some(
      (r) => !r.adiantamento_source.includes('api')
    );
    const hasNonApiGestor = data.some((r) => true); // sempre hardcoded
    const hasNonApiDiretor = data.some((r) => true); // sempre hardcoded

    if (hasNonApiSaldoReembolsar) fields.push('SALDO REEMBOLSAR');
    if (hasNonApiSaldoFinal) fields.push('SALDO FINAL');
    if (hasNonApiAdiantamento) fields.push('ADIANTAMENTO');
    if (hasNonApiGestor) fields.push('GESTOR');
    if (hasNonApiDiretor) fields.push('DIRETOR');

    return fields;
  }, [data]);

  const exportToCSV = () => {
    if (!data) return;
    const headers = [
      'COLABORADOR', 'CPF', 'SITUAÇÃO', 'REGIONAL', 'CENTRO DE CUSTO',
      'GESTOR', 'DIRETOR', 'SALDO REEMBOLSAR', 'SALDO FINAL', '1ª QZ',
      'SALDO CARTÃO', 'ADIANTAMENTO', 'CARGA PARCIAL', 'REEMBOLSO',
      'CARGA FINAL', 'OBS', 'STATUS DO CARTÃO'
    ];
    const rows = data.map((r) => [
      r.colaborador, r.cpf, r.situacao, r.regional, r.centroCusto,
      r.gestor, r.diretor, r.saldoReembolsar, r.saldoFinal, r.primeiraQZ,
      r.saldoCartao, r.adiantamento, r.cargaParcial, r.reembolso,
      r.cargaFinal, r.obs, r.statusCartao
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `planilha_${year}_${month}_qz${quinzena}.csv`;
    link.click();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Automacao da Planilha Quinzenal</h1>
          <p className="text-muted-foreground mt-1">
            Teste de extracao 100% automatica dos dados da API VExpenses
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros do Periodo</CardTitle>
          <CardDescription>Selecione o periodo para buscar dados da API</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <Label>Ano</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Mes</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {String(i + 1).padStart(2, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quinzena</Label>
              <Select value={String(quinzena)} onValueChange={(v) => setQuinzena(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1a (1-15)</SelectItem>
                  <SelectItem value="2">2a (16-fim)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max. Usuarios</Label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={fetchPlanilha} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Buscar API
              </Button>
              <Button variant="outline" onClick={exportToCSV} disabled={!data}>
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerta de campos nao automatizados */}
      {nonAutomatedFields.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Campos nao disponiveis na API</AlertTitle>
          <AlertDescription>
            Os seguintes campos nao puderam ser extraidos automaticamente da API VExpenses:
            <strong>{nonAutomatedFields.join(', ')}</strong>.
            Eles usam valores padrao, hardcoded ou padrões matemáticos (aproximacoes).
          </AlertDescription>
        </Alert>
      )}

      {/* Estatisticas */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total_users}</div>
              <div className="text-sm text-muted-foreground">Total usuarios API</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.processed_users}</div>
              <div className="text-sm text-muted-foreground">Processados</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total_expenses}</div>
              <div className="text-sm text-muted-foreground">Expenses no periodo</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total_reports}</div>
              <div className="text-sm text-muted-foreground">Reports no periodo</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Legenda de fontes */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Fonte dos Dados</CardTitle>
            <CardDescription>Como cada campo foi obtido</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.sources).map(([field, source]) => (
                <div key={field} className="flex items-center gap-1 border rounded px-2 py-1">
                  <span className="text-xs font-medium">{field}:</span>
                  {getSourceBadge(source)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Erro */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabela */}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Planilha Gerada ({data.length} usuarios)</CardTitle>
            <CardDescription>
              Periodo: {stats?.period.start_date} a {stats?.period.end_date}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="min-w-[180px]">COLABORADOR</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>SITUACAO</TableHead>
                    <TableHead>REGIONAL</TableHead>
                    <TableHead>CENTRO DE CUSTO</TableHead>
                    <TableHead>GESTOR</TableHead>
                    <TableHead>DIRETOR</TableHead>
                    <TableHead className="text-right">SALDO REEMBOLSAR</TableHead>
                    <TableHead className="text-right">SALDO FINAL</TableHead>
                    <TableHead className="text-right">1a QZ</TableHead>
                    <TableHead className="text-right">SALDO CARTAO</TableHead>
                    <TableHead className="text-right">ADIANTAMENTO</TableHead>
                    <TableHead className="text-right">CARGA PARCIAL</TableHead>
                    <TableHead className="text-right">REEMBOLSO</TableHead>
                    <TableHead className="text-right">CARGA FINAL</TableHead>
                    <TableHead>OBS</TableHead>
                    <TableHead>STATUS CARTAO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row, i) => (
                    <TableRow key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <TableCell className="font-medium">{row.colaborador}</TableCell>
                      <TableCell>{row.cpf}</TableCell>
                      <TableCell>
                        <Badge variant={row.situacao === 'ATIVO' ? 'default' : 'secondary'}>
                          {row.situacao}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.regional}</TableCell>
                      <TableCell>{row.centroCusto}</TableCell>
                      <TableCell>{row.gestor}</TableCell>
                      <TableCell>{row.diretor}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={row.saldoReembolsar_source.includes('api') ? '' : 'text-yellow-600'}>
                            {formatCurrency(row.saldoReembolsar)}
                          </span>
                          {!row.saldoReembolsar_source.includes('api') && (
                            <span className="text-[10px] text-yellow-600">aprox.</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={row.saldoFinal_source.includes('api') ? '' : 'text-yellow-600'}>
                            {formatCurrency(row.saldoFinal)}
                          </span>
                          {!row.saldoFinal_source.includes('api') && (
                            <span className="text-[10px] text-yellow-600">aprox.</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        {formatCurrency(row.primeiraQZ)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.saldoCartao)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={row.adiantamento_source.includes('api') ? '' : 'text-red-600'}>
                            {formatCurrency(row.adiantamento)}
                          </span>
                          {!row.adiantamento_source.includes('api') && (
                            <span className="text-[10px] text-red-600">N/A</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.cargaParcial)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.reembolso)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(row.cargaFinal)}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={row.obs}>
                        {row.obs}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.statusCartao === 'Cartão ativo' ? 'default' : 'outline'}>
                          {row.statusCartao}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparativo */}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Analise de Automacao</CardTitle>
            <CardDescription>Quais campos conseguimos puxar 100% da API?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { name: 'COLABORADOR', source: 'api', ok: true },
                { name: 'CPF', source: 'api', ok: true },
                { name: 'SITUACAO', source: 'api', ok: true },
                { name: 'REGIONAL', source: 'inferred', ok: false, note: 'Inferido via centro de custo' },
                { name: 'CENTRO DE CUSTO', source: 'api', ok: true },
                { name: 'GESTOR', source: 'hardcoded', ok: false, note: 'Hardcoded (FERNANDA) - API nao tem campo manager' },
                { name: 'DIRETOR', source: 'hardcoded', ok: false, note: 'Hardcoded (THIAGO/EVERSON) - API nao tem campo director' },
                { name: 'SALDO REEMBOLSAR', source: 'proxy', ok: false, note: 'Nao existe endpoint. Proxy: expenses reembolsaveis ou padrao matematico' },
                { name: 'SALDO FINAL', source: 'proxy', ok: false, note: 'Nao existe endpoint. Proxy: padrao matematico ou calculo via expenses' },
                { name: '1a QZ', source: 'api', ok: true },
                { name: 'SALDO CARTAO', source: 'api', ok: true },
                { name: 'ADIANTAMENTO', source: 'none', ok: false, note: 'Nao existe na API. Campo manual da planilha' },
                { name: 'CARGA PARCIAL', source: 'formula', ok: true },
                { name: 'REEMBOLSO', source: 'formula', ok: true },
                { name: 'CARGA FINAL', source: 'formula', ok: true },
                { name: 'OBS', source: 'api', ok: true },
                { name: 'STATUS DO CARTAO', source: 'inferred', ok: true },
              ].map((field) => (
                <div key={field.name} className="flex items-center gap-3 border-b pb-2">
                  <div className="w-8">
                    {field.ok ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">{field.name}</span>
                    {field.note && (
                      <span className="text-sm text-muted-foreground ml-2">— {field.note}</span>
                    )}
                  </div>
                  <Badge variant={field.ok ? 'default' : 'secondary'}>
                    {field.source}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
