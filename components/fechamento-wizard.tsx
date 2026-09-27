'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Snowflake, Loader2, CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, Download, ChevronRight, ChevronLeft, ListChecks,
  Calculator, Rocket, CalendarDays,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Severity = 'ok' | 'warn' | 'error';

interface PrecheckItem {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  items?: string[];
}

interface PrecheckResult {
  can_freeze: boolean;
  summary?: { errors: number; warnings: number; oks: number };
  checks: PrecheckItem[];
  period?: { month_name?: string; year?: number; quinzena?: number };
}

interface PreviewStats {
  data_mode: 'frozen' | 'calculado';
  is_frozen: boolean;
  reembolso_multiplier: number;
  period: { start_date: string; end_date: string; month_name: string };
  statistics: {
    total_rows: number;
    ativos: number;
    com_carga: number;
    total_carga_final: number;
    total_saldo_final: number;
    total_col_qz: number;
  };
  data: any[];
}

const SEV_META: Record<Severity, { icon: any; cls: string }> = {
  ok:    { icon: CheckCircle2,  cls: 'text-green-600' },
  warn:  { icon: AlertTriangle, cls: 'text-amber-500' },
  error: { icon: XCircle,       cls: 'text-red-600'   },
};

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const MESES = [
  '', 'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** Quinzena que fecha a seguir: dia 1-10 → Q1 do mês; 11-24 → Q2; 25+ → Q1 do mês seguinte. */
export function proximaQuinzenaAFechar(now = new Date()) {
  const dia = now.getDate();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let quinzena: 1 | 2;
  if (dia <= 10) {
    quinzena = 1;
  } else if (dia <= 24) {
    quinzena = 2;
  } else {
    quinzena = 1;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { year, month, quinzena };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FechamentoWizard({ open, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [period, setPeriod] = useState(proximaQuinzenaAFechar);
  const [precheck, setPrecheck] = useState<PrecheckResult | null>(null);
  const [preview, setPreview] = useState<PreviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [closing, setClosing] = useState(false);
  const [done, setDone] = useState<{ download_url?: string; rows_frozen?: number; already_frozen?: boolean } | null>(null);

  const { year, month, quinzena } = period;
  const qs = `year=${year}&month=${month}&quinzena=${quinzena}`;

  const runPrecheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/quinzena-precheck?${qs}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setPrecheck(j);
    } catch (e: any) {
      setError(e?.message || 'Erro ao verificar pendências');
    } finally {
      setLoading(false);
    }
  }, [qs]);

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/quinzena-complete?${qs}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setPreview(j);
    } catch (e: any) {
      setError(e?.message || 'Erro ao calcular prévia');
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    if (open) {
      setStep(1);
      setPeriod(proximaQuinzenaAFechar());
      setPrecheck(null);
      setPreview(null);
      setError(null);
      setAck(false);
      setDone(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && step === 1) runPrecheck();
    if (open && step === 2) runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, qs]);

  if (!open) return null;

  const hasWarnings = (precheck?.summary?.warnings ?? 0) > 0;
  // Período já congelado: precheck retorna só o check ja_congelada com
  // can_freeze=false — mas o fechar re-exporta o snapshot, então libera o fluxo.
  const alreadyFrozen = !!precheck?.checks?.some((c) => c.id === 'ja_congelada');
  const canFreeze = !!precheck?.can_freeze;
  const canAdvance = (canFreeze || alreadyFrozen) && !loading;

  const handleClose = async () => {
    setClosing(true);
    setError(null);
    try {
      const r = await fetch('/api/quinzena-fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, quinzena }),
      });
      const j = await r.json();
      if (!r.ok) {
        // 409 = precheck bloqueou de novo — volta pro passo 1 com o checklist atualizado
        setError(j.error || `Falha ao fechar (HTTP ${r.status})`);
        setStep(1);
        runPrecheck();
        return;
      }
      setDone({
        download_url: j.download_url,
        rows_frozen: j.rows_frozen,
        already_frozen: j.frozen_now === false,
      });
    } catch (e: any) {
      setError(e?.message || 'Erro ao fechar a quinzena');
    } finally {
      setClosing(false);
    }
  };

  const STEPS = [
    { n: 1, label: 'Pendências', icon: ListChecks },
    { n: 2, label: 'Prévia dos números', icon: Calculator },
    { n: 3, label: 'Congelar e gerar', icon: Rocket },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-3">
            <Snowflake className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Preparar fechamento</h2>
            <div className="flex items-center gap-1 text-sm">
              <select
                value={quinzena}
                onChange={(e) => setPeriod((p) => ({ ...p, quinzena: Number(e.target.value) as 1 | 2 }))}
                className="rounded border border-gray-300 px-1.5 py-1 text-sm"
                disabled={!!done || closing}
              >
                <option value={1}>1ª QZ</option>
                <option value={2}>2ª QZ</option>
              </select>
              <select
                value={month}
                onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) }))}
                className="rounded border border-gray-300 px-1.5 py-1 text-sm"
                disabled={!!done || closing}
              >
                {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <select
                value={year}
                onChange={(e) => setPeriod((p) => ({ ...p, year: Number(e.target.value) }))}
                className="rounded border border-gray-300 px-1.5 py-1 text-sm"
                disabled={!!done || closing}
              >
                {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 border-b border-gray-100 px-6 py-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = step === s.n;
            const doneStep = step > s.n || !!done;
            return (
              <div key={s.n} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="mx-1 h-4 w-4 text-gray-300" />}
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  active ? 'bg-blue-600 text-white' : doneStep ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {doneStep && !active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {done ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="mb-3 h-12 w-12 text-green-600" />
              <p className="text-base font-semibold text-gray-900">
                Quinzena {done.already_frozen ? 'já estava congelada' : 'congelada'} e planilha gerada
              </p>
              {!!done.rows_frozen && (
                <p className="mt-1 text-sm text-gray-600">{done.rows_frozen} colaboradores no snapshot</p>
              )}
              <a
                href={done.download_url}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Baixar planilha da quinzena
              </a>
              <p className="mt-3 text-xs text-gray-500">Também disponível no sino de notificações.</p>
            </div>
          ) : loading && ((step === 1 && !precheck) || (step === 2 && !preview)) ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-600">
                {step === 1 ? 'Verificando pendências da quinzena…' : 'Calculando a prévia dos números…'}
              </span>
            </div>
          ) : step === 1 && precheck ? (
            <div className="space-y-2">
              {precheck.summary && (
                <div className="mb-3 flex items-center gap-2 text-xs">
                  {precheck.summary.errors > 0 && (
                    <Badge className="bg-red-100 text-red-700">{precheck.summary.errors} bloqueio(s)</Badge>
                  )}
                  {precheck.summary.warnings > 0 && (
                    <Badge className="bg-amber-100 text-amber-700">{precheck.summary.warnings} alerta(s)</Badge>
                  )}
                  <Badge className="bg-green-100 text-green-700">{precheck.summary.oks} ok</Badge>
                  <button
                    onClick={runPrecheck}
                    disabled={loading}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Reverificar
                  </button>
                </div>
              )}
              {!canFreeze && !alreadyFrozen && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  Resolva os bloqueios abaixo antes de avançar — o fechamento não pode gravar um snapshot com dados inconsistentes.
                </p>
              )}
              {alreadyFrozen && (
                <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Este período já está congelado — continuar gera uma nova exportação do snapshot existente (sem alterar os dados).
                </p>
              )}
              {precheck.checks.map((c) => {
                const meta = SEV_META[c.severity];
                const Icon = meta.icon;
                return (
                  <div
                    key={c.id}
                    className={`flex gap-3 rounded-lg border p-3 ${
                      c.severity === 'error'
                        ? 'border-red-200 bg-red-50'
                        : c.severity === 'warn'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-gray-200 bg-white'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${meta.cls}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{c.title}</p>
                      {c.detail && <p className="mt-0.5 text-xs text-gray-600">{c.detail}</p>}
                      {c.items && c.items.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                          {c.items.map((it, i) => <li key={i}>• {it}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : step === 2 && preview ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                {preview.period.month_name} · {fmtDate(preview.period.start_date)} → {fmtDate(preview.period.end_date)}
                {preview.is_frozen && (
                  <Badge variant="outline" className="ml-2 text-xs text-blue-700 border-blue-200 bg-blue-50">
                    já congelada — números do snapshot
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Colaboradores', value: String(preview.statistics.total_rows), sub: `${preview.statistics.ativos} ativos` },
                  { label: 'Com carga na QZ', value: String(preview.statistics.com_carga), sub: 'receberam valor' },
                  { label: 'Carga da quinzena', value: BRL(preview.statistics.total_carga_final), sub: 'total a carregar' },
                  { label: 'Quinzenas cadastradas', value: BRL(preview.statistics.total_col_qz), sub: 'soma dos valores cadastrados' },
                  { label: 'Saldo final', value: BRL(preview.statistics.total_saldo_final), sub: 'carga − uso apurado' },
                  { label: 'A reembolsar', value: BRL(preview.data.reduce((s: number, r: any) => s + Math.max(0, r.saldo_reembolsar ?? 0), 0)), sub: `mult. ${preview.reembolso_multiplier}` },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg border border-gray-200 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{k.label}</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{k.value}</p>
                    <p className="text-xs text-gray-500">{k.sub}</p>
                  </div>
                ))}
              </div>
              {hasWarnings && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-gray-700">
                  <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>
                    Li os {precheck?.summary?.warnings} alerta(s) do passo anterior e entendo que congelar
                    grava um snapshot permanente com os dados como estão.
                  </span>
                </label>
              )}
            </div>
          ) : step === 3 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Snowflake className="mb-3 h-10 w-10 text-blue-600" />
              <p className="text-base font-semibold text-gray-900">
                {alreadyFrozen ? 'Re-exportar' : 'Congelar'} {MESES[month]}/{year} · {quinzena}ª QZ?
              </p>
              <p className="mt-2 max-w-md text-sm text-gray-600">
                {alreadyFrozen
                  ? 'O snapshot congelado será mantido intacto — só a planilha será gerada de novo e os administradores notificados com o link.'
                  : 'Será gravado o snapshot permanente da quinzena, gerada a planilha completa e notificados os administradores com o link de download.'}
              </p>
              {precheck?.summary && (
                <p className="mt-3 text-xs text-gray-500">
                  Última verificação: {precheck.summary.errors} bloqueio(s) · {precheck.summary.warnings} alerta(s) · {precheck.summary.oks} ok
                </p>
              )}
              {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={step === 1 ? runPrecheck : runPreview}>
                Tentar novamente
              </Button>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
          <div>
            {step > 1 && !done && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} disabled={closing}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Voltar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {done ? 'Fechar' : 'Cancelar'}
            </Button>
            {!done && step === 1 && (
              <Button size="sm" disabled={!canAdvance} onClick={() => setStep(2)}
                title={!canFreeze ? 'Corrija os bloqueios antes de avançar' : undefined}>
                Ver prévia dos números
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            {!done && step === 2 && (
              <Button size="sm" disabled={loading || !preview || (hasWarnings && !ack)}
                title={hasWarnings && !ack ? 'Confirme que leu os alertas' : undefined}
                onClick={() => setStep(3)}>
                Avançar para congelar
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            {!done && step === 3 && (
              <Button
                size="sm"
                variant={hasWarnings ? 'destructive' : 'default'}
                disabled={closing}
                onClick={handleClose}
              >
                {closing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Snowflake className="mr-1 h-4 w-4" />}
                {closing
                  ? 'Gerando planilha…'
                  : alreadyFrozen
                    ? 'Gerar planilha do snapshot'
                    : hasWarnings ? 'Congelar e gerar mesmo assim' : 'Congelar e gerar planilha'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
