'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileSpreadsheet,
  FileText,
  Search,
  Download,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  User,
  RefreshCw,
  Clock,
  AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';

// ---- Types ------------------------------------------------------------------

interface ExtratoRow {
  data: string;
  hora: string;
  codigo_transacao: string;
  usuario: string;
  tipo: string;
  descricao: string;
  valor: number;
  is_snapshot: boolean;
}

interface PrestacaoRow {
  despesa_id: number;
  relatorio_id: number;
  nome_relatorio: string;
  data: string;
  nome_membro: string;
  cpf: string;
  status: string;
  descricao_despesa: string;
  tipo_despesa: string;
  reembolsavel: string;
  anotacao: string;
  centro_custos: string;
  forma_pagamento: string;
  projeto: string;
  percentual_projeto: number;
  moeda_relatorio: string;
  valor: number;
  valor_total: number;
  ultrapassou_politica: string;
}

interface MonthAggregation {
  ano: number;
  mes: string;
  carga: number;
  transferencia: number;
  taxa: number;
  prestacao_contas: number;
  saldo: number;
  acumulado: number;
}

interface FechoResponse {
  colaborador: string;
  cpf: string | null;
  extrato: ExtratoRow[];
  prestacaoContas: PrestacaoRow[];
  fechamento: MonthAggregation[];
  resumo: {
    saldoFinal: number;
    saldoDisponivel: number;
    prestacaoContas: number;
    fechamentoPrestacao: number;
    saldoCartao: number;
    fechamentoFinal: number;
  };
  statusPanel: {
    aberto: number;
    aprovado: number;
    totalGeral: number;
  };
  exportadoEm: string;
}

interface TeamMember {
  id: number;
  name: string;
  cpf: number;
  email: string;
}

// ---- Helpers ----------------------------------------------------------------

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR') + ' ' + (d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '');
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function formatTimestamp(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Component ---------------------------------------------------------------

export default function FechamentoPage() {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [data, setData] = useState<FechoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Fetch team members on mount
  React.useEffect(() => {
    async function fetchMembers() {
      try {
        const res = await fetch('/api/vexpenses/team-members');
        if (res.ok) {
          const json = await res.json();
          setTeamMembers(json.data || []);
        }
      } catch (e) {
        console.error('Error fetching team members:', e);
      } finally {
        setMembersLoading(false);
      }
    }
    fetchMembers();
  }, []);

  // Filter team members by search
  const filteredMembers = useMemo(() => {
    if (!searchTerm) return teamMembers;
    const term = searchTerm.toLowerCase();
    return teamMembers.filter(m =>
      m.name.toLowerCase().includes(term) ||
      String(m.cpf || '').includes(term)
    );
  }, [teamMembers, searchTerm]);

  // Fetch fechamento data
  const fetchFechamento = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/fechamento?userId=${userId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao buscar dados');
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar fechamento');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectUser = (value: string) => {
    setSelectedUserId(value);
    fetchFechamento(value);
    fetchSyncStatus(value);
  };

  // Fetch last sync timestamp
  const fetchSyncStatus = useCallback(async (userId: string) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/fechamento/sync?userId=${userId}`);
      if (res.ok) {
        const json = await res.json();
        setSyncedAt(json.syncedAt || null);
      }
    } catch (e) {
      console.error('Error fetching sync status:', e);
    }
  }, []);

  // Sync data from VExpenses API
  const handleSync = useCallback(async () => {
    if (!selectedUserId || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`/api/fechamento/sync?userId=${selectedUserId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao sincronizar');
      }
      const json = await res.json();
      setSyncedAt(json.syncedAt);
      let msg = `Sincronizado: ${json.reportsSynced} relatórios, ${json.expensesSynced} despesas`;
      if (json.extratoSynced > 0) {
        msg += `, ${json.extratoSynced} extrato`;
      }
      if (json.extratoError) {
        msg += ` | Aviso extrato: ${json.extratoError}`;
      }
      setSyncMessage(msg);
      // Re-fetch fechamento data after sync
      await fetchFechamento(selectedUserId);
    } catch (e: any) {
      setSyncMessage(`Erro: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }, [selectedUserId, syncing, fetchFechamento]);

  // ---- XLSX Export -----------------------------------------------------------

  const exportXLSX = useCallback(() => {
    if (!data) return;

    const wb = XLSX.utils.book_new();

    // -- Styles --
    const corPrimaria = '1E3A5F';       // Azul escuro
    const corSecundaria = '2E86C1';      // Azul médio
    const corVerde = '1E8449';           // Verde
    const corVermelho = 'C0392B';        // Vermelho
    const corLaranja = 'D35400';         // Laranja
    const corCinzaClaro = 'F2F2F2';     // Cinza claro bg
    const corCinzaMedio = 'D5D8DC';     // Cinza borda
    const corBranco = 'FFFFFF';

    const fmtBRL = '#"R$ "\\ #,##0.00';

    const styleTitle = {
      font: { bold: true, sz: 16, color: { rgb: corBranco } },
      fill: { fgColor: { rgb: corPrimaria } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const styleSubtitle = {
      font: { bold: true, sz: 12, color: { rgb: corPrimaria } },
      alignment: { horizontal: 'center' },
    };
    const styleHeader = {
      font: { bold: true, sz: 11, color: { rgb: corBranco } },
      fill: { fgColor: { rgb: corSecundaria } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: corCinzaMedio } },
        bottom: { style: 'thin', color: { rgb: corCinzaMedio } },
        left: { style: 'thin', color: { rgb: corCinzaMedio } },
        right: { style: 'thin', color: { rgb: corCinzaMedio } },
      },
    };
    const styleCell = {
      font: { sz: 10 },
      alignment: { vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: corCinzaMedio } },
        bottom: { style: 'thin', color: { rgb: corCinzaMedio } },
        left: { style: 'thin', color: { rgb: corCinzaMedio } },
        right: { style: 'thin', color: { rgb: corCinzaMedio } },
      },
    };
    const styleCellRight = { ...styleCell, alignment: { horizontal: 'right', vertical: 'center' } };
    const styleCellCenter = { ...styleCell, alignment: { horizontal: 'center', vertical: 'center' } };
    const styleTotalRow = {
      font: { bold: true, sz: 11, color: { rgb: corPrimaria } },
      fill: { fgColor: { rgb: corCinzaClaro } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: corPrimaria } },
        bottom: { style: 'medium', color: { rgb: corPrimaria } },
        left: { style: 'thin', color: { rgb: corCinzaMedio } },
        right: { style: 'thin', color: { rgb: corCinzaMedio } },
      },
    };
    const styleTotalLabel = {
      ...styleTotalRow,
      alignment: { horizontal: 'left', vertical: 'center' },
    };
    const styleResumoLabel = {
      font: { bold: true, sz: 10, color: { rgb: corPrimaria } },
      alignment: { horizontal: 'left', vertical: 'center' },
    };
    const styleResumoValue = {
      font: { bold: true, sz: 11, color: { rgb: corPrimaria } },
      alignment: { horizontal: 'right', vertical: 'center' },
      numberFormat: fmtBRL,
    };
    const styleStatusAberto = {
      font: { bold: true, sz: 10, color: { rgb: corLaranja } },
      alignment: { horizontal: 'right', vertical: 'center' },
      numberFormat: fmtBRL,
    };
    const styleStatusAprovado = {
      font: { bold: true, sz: 10, color: { rgb: corVerde } },
      alignment: { horizontal: 'right', vertical: 'center' },
      numberFormat: fmtBRL,
    };
    const styleMoneyGreen = { ...styleCellRight, font: { sz: 10, color: { rgb: corVerde } }, numberFormat: fmtBRL };
    const styleMoneyRed = { ...styleCellRight, font: { sz: 10, color: { rgb: corVermelho } }, numberFormat: fmtBRL };
    const styleMoneyBlue = { ...styleCellRight, font: { sz: 10, color: { rgb: corSecundaria } }, numberFormat: fmtBRL };
    const styleMoneyOrange = { ...styleCellRight, font: { sz: 10, color: { rgb: corLaranja } }, numberFormat: fmtBRL };
    const styleMoneyBold = {
      ...styleCellRight,
      font: { bold: true, sz: 10, color: { rgb: corPrimaria } },
      numberFormat: fmtBRL,
    };

    // -- Sheet 1: FECHAMENTO --
    const wsData: any[][] = [];
    wsData.push(['FECHAMENTO DE PRESTAÇÃO DE CONTAS']);
    wsData.push([]);
    wsData.push([data.colaborador]);
    if (data.cpf) {
      wsData.push([`CPF: ${data.cpf.padStart(11, '0').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`]);
    }
    wsData.push([]);
    wsData.push(['Ano', 'Mês', 'Carga', 'Transferência', 'Taxa', 'Prest. Contas', 'Saldo', 'Acumulado']);
    for (const m of data.fechamento) {
      wsData.push([m.ano, m.mes.charAt(0) + m.mes.slice(1).toLowerCase(), m.carga, m.transferencia, m.taxa, m.prestacao_contas, m.saldo, m.acumulado]);
    }
    const totalCarga = data.fechamento.reduce((s, m) => s + m.carga, 0);
    const totalTransf = data.fechamento.reduce((s, m) => s + m.transferencia, 0);
    const totalTaxa = data.fechamento.reduce((s, m) => s + m.taxa, 0);
    const totalPrest = data.fechamento.reduce((s, m) => s + m.prestacao_contas, 0);
    const totalSaldo = data.fechamento.reduce((s, m) => s + m.saldo, 0);
    wsData.push(['TOTAL', '', totalCarga, totalTransf, totalTaxa, totalPrest, totalSaldo, data.resumo.saldoFinal]);
    wsData.push([]);
    wsData.push(['RESUMO FINANCEIRO', '', '']);
    wsData.push(['Saldo Final', '', data.resumo.saldoFinal]);
    wsData.push(['(+) Saldo Disponível', '', data.resumo.saldoDisponivel]);
    wsData.push(['(-) Prestação de Contas', '', data.resumo.prestacaoContas]);
    wsData.push(['= Fechamento Prest. Contas', '', data.resumo.fechamentoPrestacao]);
    wsData.push(['(-) Saldo Cartão', '', data.resumo.saldoCartao]);
    wsData.push(['= Fechamento Final', '', data.resumo.fechamentoFinal]);
    wsData.push([]);
    wsData.push(['STATUS DOS RELATÓRIOS', '', '']);
    wsData.push(['Aberto', '', data.statusPanel.aberto]);
    wsData.push(['Aprovado', '', data.statusPanel.aprovado]);
    wsData.push(['Total Geral', '', data.statusPanel.totalGeral]);
    wsData.push([]);
    wsData.push(['Exportado em', formatTimestamp(data.exportadoEm)]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply merges
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } },
    ];

    // Apply styles
    const headerRowIdx = 5; // row 6 (0-indexed)
    const dataStartRow = 6;
    const dataEndRow = dataStartRow + data.fechamento.length - 1;
    const totalRowIdx = dataEndRow + 1;

    // Title row
    for (let c = 0; c <= 7; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = styleTitle;
    }
    // Name + CPF
    for (let c = 0; c <= 7; c++) {
      const addr = XLSX.utils.encode_cell({ r: 2, c });
      if (ws[addr]) ws[addr].s = styleSubtitle;
      const addr2 = XLSX.utils.encode_cell({ r: 3, c });
      if (ws[addr2]) ws[addr2].s = { ...styleSubtitle, font: { sz: 10, color: { rgb: '666666' } } };
    }
    // Header row
    for (let c = 0; c <= 7; c++) {
      const addr = XLSX.utils.encode_cell({ r: headerRowIdx, c });
      if (ws[addr]) ws[addr].s = styleHeader;
    }
    // Data rows
    for (let r = dataStartRow; r <= dataEndRow; r++) {
      const m = data.fechamento[r - dataStartRow];
      // Ano
      const cAno = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[cAno]) ws[cAno].s = styleCellCenter;
      // Mês
      const cMes = XLSX.utils.encode_cell({ r, c: 1 });
      if (ws[cMes]) ws[cMes].s = styleCell;
      // Carga
      const cCarga = XLSX.utils.encode_cell({ r, c: 2 });
      if (ws[cCarga]) ws[cCarga].s = styleMoneyGreen;
      // Transferência
      const cTransf = XLSX.utils.encode_cell({ r, c: 3 });
      if (ws[cTransf]) ws[cTransf].s = styleMoneyBlue;
      // Taxa
      const cTaxa = XLSX.utils.encode_cell({ r, c: 4 });
      if (ws[cTaxa]) ws[cTaxa].s = styleMoneyRed;
      // Prest. Contas
      const cPrest = XLSX.utils.encode_cell({ r, c: 5 });
      if (ws[cPrest]) ws[cPrest].s = styleMoneyOrange;
      // Saldo
      const cSaldo = XLSX.utils.encode_cell({ r, c: 6 });
      if (ws[cSaldo]) ws[cSaldo].s = m.saldo >= 0 ? styleMoneyGreen : styleMoneyRed;
      // Acumulado
      const cAcum = XLSX.utils.encode_cell({ r, c: 7 });
      if (ws[cAcum]) ws[cAcum].s = m.acumulado >= 0 ? styleMoneyBold : { ...styleMoneyBold, font: { bold: true, sz: 10, color: { rgb: corVermelho } } };
    }
    // Total row
    for (let c = 0; c <= 7; c++) {
      const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
      if (!ws[addr]) continue;
      if (c < 2) {
        ws[addr].s = styleTotalLabel;
      } else {
        ws[addr].s = { ...styleTotalRow, numberFormat: fmtBRL };
      }
    }

    // Resumo section
    let rowIdx = totalRowIdx + 2; // skip blank row
    // Section title
    for (let c = 0; c <= 2; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
      if (ws[addr]) ws[addr].s = { font: { bold: true, sz: 12, color: { rgb: corBranco } }, fill: { fgColor: { rgb: corPrimaria } }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
    rowIdx++;
    const resumoItems = [
      { label: 'Saldo Final', value: data.resumo.saldoFinal, color: data.resumo.saldoFinal >= 0 ? corVerde : corVermelho },
      { label: '(+) Saldo Disponível', value: data.resumo.saldoDisponivel, color: corVerde },
      { label: '(-) Prestação de Contas', value: data.resumo.prestacaoContas, color: corLaranja },
      { label: '= Fechamento Prest. Contas', value: data.resumo.fechamentoPrestacao, color: data.resumo.fechamentoPrestacao >= 0 ? corVerde : corVermelho },
      { label: '(-) Saldo Cartão', value: data.resumo.saldoCartao, color: corVermelho },
      { label: '= Fechamento Final', value: data.resumo.fechamentoFinal, color: data.resumo.fechamentoFinal >= 0 ? corVerde : corVermelho },
    ];
    for (const item of resumoItems) {
      const cLabel = XLSX.utils.encode_cell({ r: rowIdx, c: 0 });
      if (ws[cLabel]) ws[cLabel].s = { ...styleResumoLabel, font: { bold: true, sz: 10, color: { rgb: item.color } } };
      const cValue = XLSX.utils.encode_cell({ r: rowIdx, c: 2 });
      if (ws[cValue]) ws[cValue].s = { ...styleResumoValue, font: { bold: true, sz: 11, color: { rgb: item.color } } };
      rowIdx++;
    }

    rowIdx++; // skip blank
    // Status section title
    for (let c = 0; c <= 2; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
      if (ws[addr]) ws[addr].s = { font: { bold: true, sz: 12, color: { rgb: corBranco } }, fill: { fgColor: { rgb: corPrimaria } }, alignment: { horizontal: 'left', vertical: 'center' } };
    }
    rowIdx++;
    const statusItems = [
      { label: 'Aberto', value: data.statusPanel.aberto, style: styleStatusAberto },
      { label: 'Aprovado', value: data.statusPanel.aprovado, style: styleStatusAprovado },
      { label: 'Total Geral', value: data.statusPanel.totalGeral, style: { ...styleResumoValue, font: { bold: true, sz: 11, color: { rgb: corPrimaria } } } },
    ];
    for (const item of statusItems) {
      const cLabel = XLSX.utils.encode_cell({ r: rowIdx, c: 0 });
      if (ws[cLabel]) ws[cLabel].s = { ...styleResumoLabel, font: { bold: true, sz: 10, color: { rgb: '333333' } } };
      const cValue = XLSX.utils.encode_cell({ r: rowIdx, c: 2 });
      if (ws[cValue]) ws[cValue].s = item.style;
      rowIdx++;
    }

    rowIdx++; // skip blank
    // Export timestamp
    const cExp = XLSX.utils.encode_cell({ r: rowIdx, c: 0 });
    if (ws[cExp]) ws[cExp].s = { font: { italic: true, sz: 9, color: { rgb: '999999' } } };

    // Column widths
    ws['!cols'] = [
      { wch: 10 }, // Ano
      { wch: 12 }, // Mês
      { wch: 16 }, // Carga
      { wch: 16 }, // Transferência
      { wch: 14 }, // Taxa
      { wch: 18 }, // Prest. Contas
      { wch: 16 }, // Saldo
      { wch: 16 }, // Acumulado
    ];

    // Row heights
    ws['!rows'] = [];
    ws['!rows'][0] = { hpt: 30 }; // Title
    ws['!rows'][headerRowIdx] = { hpt: 22 }; // Header
    ws['!rows'][totalRowIdx] = { hpt: 22 }; // Total

    XLSX.utils.book_append_sheet(wb, ws, 'FECHAMENTO');

    // -- Sheet 2: EXTRATO --
    const extratoAOA: any[][] = [];
    extratoAOA.push(['EXTRATO DE MOVIMENTAÇÃO']);
    extratoAOA.push([]);
    extratoAOA.push(['Ano', 'Mês', 'Data', 'Hora', 'Código', 'Usuário', 'Tipo', 'Descrição', 'Valor']);
    for (const row of data.extrato) {
      const parts = row.data.split('T')[0].split('-');
      const ano = parseInt(parts[0]);
      const mesIdx = parseInt(parts[1]) - 1;
      const mesesPt = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
      extratoAOA.push([ano, mesesPt[mesIdx], row.data, row.hora, row.codigo_transacao, row.usuario, row.tipo, row.descricao, row.valor]);
    }
    const wsExtrato = XLSX.utils.aoa_to_sheet(extratoAOA);
    wsExtrato['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
    // Style extrato
    for (let c = 0; c <= 8; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (wsExtrato[addr]) wsExtrato[addr].s = styleTitle;
      const addrH = XLSX.utils.encode_cell({ r: 2, c });
      if (wsExtrato[addrH]) wsExtrato[addrH].s = styleHeader;
    }
    for (let r = 3; r < extratoAOA.length; r++) {
      for (let c = 0; c <= 8; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!wsExtrato[addr]) continue;
        if (c === 8) {
          wsExtrato[addr].s = wsExtrato[addr].v >= 0 ? styleMoneyGreen : styleMoneyRed;
        } else if (c === 6) {
          wsExtrato[addr].s = styleCellCenter;
        } else {
          wsExtrato[addr].s = styleCell;
        }
      }
    }
    wsExtrato['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
      { wch: 30 }, { wch: 14 }, { wch: 40 }, { wch: 14 },
    ];
    wsExtrato['!rows'] = [{ hpt: 30 }];
    XLSX.utils.book_append_sheet(wb, wsExtrato, 'EXTRATO');

    // -- Sheet 3: PREST. CONTAS --
    const prestAOA: any[][] = [];
    prestAOA.push(['PRESTAÇÃO DE CONTAS']);
    prestAOA.push([]);
    prestAOA.push([
      'Ano', 'Mês', 'ID Despesa', 'ID Relatório', 'Relatório',
      'Data', 'Membro', 'CPF/CNPJ', 'Status',
      'Descrição', 'Tipo', 'Reembolsável', 'Anotação',
      'Centro de Custos', 'Forma Pagamento', 'Projeto',
      '% Projeto', 'Moeda', 'Valor', 'Valor Total', 'Ultrapassou Política'
    ]);
    for (const row of data.prestacaoContas) {
      const parts = row.data.split('T')[0].split('-');
      const ano = parseInt(parts[0]);
      const mesIdx = parseInt(parts[1]) - 1;
      const mesesPt = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
      prestAOA.push([
        ano, mesesPt[mesIdx], row.despesa_id, row.relatorio_id, row.nome_relatorio,
        row.data, row.nome_membro, row.cpf, row.status,
        row.descricao_despesa, row.tipo_despesa, row.reembolsavel, row.anotacao,
        row.centro_custos, row.forma_pagamento, row.projeto,
        row.percentual_projeto, row.moeda_relatorio, row.valor, row.valor_total, row.ultrapassou_politica
      ]);
    }
    const wsPrest = XLSX.utils.aoa_to_sheet(prestAOA);
    wsPrest['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 20 } }];
    for (let c = 0; c <= 20; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (wsPrest[addr]) wsPrest[addr].s = styleTitle;
      const addrH = XLSX.utils.encode_cell({ r: 2, c });
      if (wsPrest[addrH]) wsPrest[addrH].s = styleHeader;
    }
    for (let r = 3; r < prestAOA.length; r++) {
      for (let c = 0; c <= 20; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!wsPrest[addr]) continue;
        if (c === 19) {
          wsPrest[addr].s = styleMoneyBold;
        } else if (c === 8) {
          const st = (String(wsPrest[addr].v || '')).toUpperCase();
          if (st === 'APROVADO') wsPrest[addr].s = { ...styleCellCenter, font: { sz: 10, color: { rgb: corVerde }, bold: true } };
          else if (st === 'ABERTO' || st === 'ENVIADO') wsPrest[addr].s = { ...styleCellCenter, font: { sz: 10, color: { rgb: corLaranja }, bold: true } };
          else wsPrest[addr].s = styleCellCenter;
        } else {
          wsPrest[addr].s = styleCell;
        }
      }
    }
    wsPrest['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 25 },
      { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 12 },
      { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 20 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    ];
    wsPrest['!rows'] = [{ hpt: 30 }];
    XLSX.utils.book_append_sheet(wb, wsPrest, 'PREST. CONTAS');

    const fileName = `FECHAMENTO - ${data.colaborador.toUpperCase()}.xlsx`;
    XLSX.writeFile(wb, fileName, { cellStyles: true });
  }, [data]);

  // ---- PDF Print -------------------------------------------------------------

  const exportPDF = useCallback(() => {
    window.print();
  }, []);

  // ---- Render ----------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header - hidden in print */}
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-gray-900">Fechamento Individual</h1>
        <p className="text-sm text-gray-500 mt-1">
          Selecione um colaborador para visualizar o fechamento de prestação de contas
        </p>
      </div>

      {/* User Selector - hidden in print */}
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Colaborador
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar por nome ou CPF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-xs"
                />
                <Select value={selectedUserId} onValueChange={handleSelectUser}>
                  <SelectTrigger className="w-full min-w-[300px]">
                    <SelectValue placeholder={membersLoading ? "Carregando..." : "Selecione um colaborador"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {filteredMembers.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name} {m.cpf ? `— ${String(m.cpf).padStart(11, '0').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {data && (
              <div className="flex gap-2">
                <Button onClick={handleSync} variant="outline" disabled={syncing || !selectedUserId}>
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sincronizando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Atualizar Dados
                    </>
                  )}
                </Button>
                <Button onClick={exportXLSX} variant="default">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar XLSX
                </Button>
                <Button onClick={exportPDF} variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Exportar PDF
                </Button>
              </div>
            )}
          </div>
          {/* Sync status info */}
          {selectedUserId && (
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              {syncedAt ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Última atualização: {formatTimestamp(syncedAt)}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Dados podem estar desatualizados. Clique em "Atualizar Dados" para sincronizar.
                </span>
              )}
              {syncMessage && (
                <span className={syncMessage.startsWith('Erro') ? 'text-red-600' : syncMessage.includes('Aviso') ? 'text-yellow-600' : 'text-green-600'}>
                  {syncMessage}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 print:hidden">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">Carregando dados do fechamento...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 print:hidden">
          <CardContent className="pt-6">
            <p className="text-red-600 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Data */}
      {data && !loading && (
        <div className="space-y-6">
          {/* ====================================================== */}
          {/* PDF PRINT LAYOUT — only visible when printing          */}
          {/* ====================================================== */}
          <div className="hidden print:block">
            {/* Branded header banner */}
            <div style={{
              background: 'linear-gradient(135deg, #1E3A5F 0%, #2E86C1 100%)',
              color: '#fff',
              padding: '24px 32px',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '0.5px' }}>
                    FECHAMENTO DE PRESTAÇÃO DE CONTAS
                  </h1>
                  <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '6px 0 0 0', opacity: 0.9 }}>
                    {data.colaborador}
                  </h2>
                  {data.cpf && (
                    <p style={{ fontSize: '11px', margin: '2px 0 0 0', opacity: 0.7 }}>
                      CPF: {data.cpf.padStart(11, '0').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '10px', margin: 0, opacity: 0.7 }}>vExpenses Dashboard</p>
                  <p style={{ fontSize: '10px', margin: '2px 0 0 0', opacity: 0.7 }}>
                    {formatTimestamp(data.exportadoEm)}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary cards for print — 3x2 grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              marginBottom: '20px',
            }}>
              {[
                { label: 'Saldo Final', value: data.resumo.saldoFinal, color: data.resumo.saldoFinal >= 0 ? '#1E8449' : '#C0392B' },
                { label: 'Saldo Disponível', value: data.resumo.saldoDisponivel, color: '#1E8449' },
                { label: 'Prestação de Contas', value: data.resumo.prestacaoContas, color: '#D35400' },
                { label: 'Fechamento', value: data.resumo.fechamentoPrestacao, color: data.resumo.fechamentoPrestacao >= 0 ? '#1E8449' : '#C0392B' },
                { label: 'Saldo Cartão', value: data.resumo.saldoCartao, color: '#666666' },
                { label: 'Fechamento Final', value: data.resumo.fechamentoFinal, color: data.resumo.fechamentoFinal >= 0 ? '#1E8449' : '#C0392B' },
              ].map((item, i) => (
                <div key={i} style={{
                  border: '1px solid #D5D8DC',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  backgroundColor: i === 5 ? '#EBF5FB' : '#FAFAFA',
                }}>
                  <p style={{ fontSize: '9px', color: '#666', margin: '0 0 4px 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {item.label}
                  </p>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: item.color, margin: 0 }}>
                    {formatBRL(item.value)}
                  </p>
                </div>
              ))}
            </div>

            {/* Status panel for print */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              marginBottom: '20px',
            }}>
              {[
                { label: 'Aberto', value: data.statusPanel.aberto, color: '#D35400', bg: '#FDF2E9' },
                { label: 'Aprovado', value: data.statusPanel.aprovado, color: '#1E8449', bg: '#E9F7EF' },
                { label: 'Total Geral', value: data.statusPanel.totalGeral, color: '#1E3A5F', bg: '#F2F2F2' },
              ].map((item, i) => (
                <div key={i} style={{
                  border: `1px solid ${item.color}33`,
                  borderRadius: '6px',
                  padding: '10px 14px',
                  backgroundColor: item.bg,
                }}>
                  <p style={{ fontSize: '9px', color: item.color, margin: '0 0 4px 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {item.label}
                  </p>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: item.color, margin: 0 }}>
                    {formatBRL(item.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ====================================================== */}
          {/* SCREEN LAYOUT — hidden when printing                   */}
          {/* ====================================================== */}

          {/* Summary Cards — screen only */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 print:hidden">
            <SummaryCard
              title="Saldo Final"
              value={data.resumo.saldoFinal}
              icon={<Wallet className="h-4 w-4" />}
              variant={data.resumo.saldoFinal >= 0 ? 'positive' : 'negative'}
            />
            <SummaryCard
              title="Saldo Disponível"
              value={data.resumo.saldoDisponivel}
              icon={<ArrowUpCircle className="h-4 w-4" />}
              variant="positive"
            />
            <SummaryCard
              title="Prestação de Contas"
              value={data.resumo.prestacaoContas}
              icon={<ArrowDownCircle className="h-4 w-4" />}
              variant="negative"
            />
            <SummaryCard
              title="Fechamento"
              value={data.resumo.fechamentoPrestacao}
              icon={<TrendingUp className="h-4 w-4" />}
              variant={data.resumo.fechamentoPrestacao >= 0 ? 'positive' : 'negative'}
            />
            <SummaryCard
              title="Saldo Cartão"
              value={data.resumo.saldoCartao}
              icon={<Wallet className="h-4 w-4" />}
              variant="neutral"
            />
            <SummaryCard
              title="Fechamento Final"
              value={data.resumo.fechamentoFinal}
              icon={<Receipt className="h-4 w-4" />}
              variant={data.resumo.fechamentoFinal >= 0 ? 'positive' : 'negative'}
              highlight
            />
          </div>

          {/* Status Panel — screen only */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Aberto</p>
                    <p className="text-lg font-semibold text-orange-600">
                      {formatBRL(data.statusPanel.aberto)}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    Pendente
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Aprovado</p>
                    <p className="text-lg font-semibold text-green-600">
                      {formatBRL(data.statusPanel.aprovado)}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Aprovado
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Total Geral</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {formatBRL(data.statusPanel.totalGeral)}
                    </p>
                  </div>
                  <Badge variant="outline">
                    Total
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* FECHAMENTO Table — visible on screen AND print */}
          <Card>
            <CardHeader className="print:py-2">
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Fechamento Mensal
              </CardTitle>
            </CardHeader>
            <CardContent className="print:py-1">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Ano</TableHead>
                      <TableHead className="font-semibold">Mês</TableHead>
                      <TableHead className="text-right font-semibold">Carga</TableHead>
                      <TableHead className="text-right font-semibold">Transferência</TableHead>
                      <TableHead className="text-right font-semibold">Taxa</TableHead>
                      <TableHead className="text-right font-semibold">Prest. Contas</TableHead>
                      <TableHead className="text-right font-semibold">Saldo</TableHead>
                      <TableHead className="text-right font-semibold">Acumulado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.fechamento.map((m, i) => (
                      <TableRow key={`${m.ano}-${m.mes}`}>
                        <TableCell className="font-medium">{m.ano}</TableCell>
                        <TableCell className="capitalize">{m.mes.toLowerCase()}</TableCell>
                        <TableCell className="text-right text-green-600">{formatBRL(m.carga)}</TableCell>
                        <TableCell className="text-right text-blue-600">{formatBRL(m.transferencia)}</TableCell>
                        <TableCell className="text-right text-red-600">{formatBRL(m.taxa)}</TableCell>
                        <TableCell className="text-right text-orange-600">{formatBRL(m.prestacao_contas)}</TableCell>
                        <TableCell className={`text-right font-medium ${m.saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {formatBRL(m.saldo)}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${m.acumulado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {formatBRL(m.acumulado)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="border-t-2 border-gray-300 font-bold bg-gray-50">
                      <TableCell colSpan={2}>TOTAL</TableCell>
                      <TableCell className="text-right text-green-700">
                        {formatBRL(data.fechamento.reduce((s, m) => s + m.carga, 0))}
                      </TableCell>
                      <TableCell className="text-right text-blue-700">
                        {formatBRL(data.fechamento.reduce((s, m) => s + m.transferencia, 0))}
                      </TableCell>
                      <TableCell className="text-right text-red-700">
                        {formatBRL(data.fechamento.reduce((s, m) => s + m.taxa, 0))}
                      </TableCell>
                      <TableCell className="text-right text-orange-700">
                        {formatBRL(data.fechamento.reduce((s, m) => s + m.prestacao_contas, 0))}
                      </TableCell>
                      <TableCell className="text-right text-gray-900">
                        {formatBRL(data.fechamento.reduce((s, m) => s + m.saldo, 0))}
                      </TableCell>
                      <TableCell className="text-right text-gray-900">
                        {formatBRL(data.resumo.saldoFinal)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* EXTRATO Table — screen only, hidden in print */}
          <Card className="print:hidden">
            <CardHeader className="print:py-2">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Extrato ({data.extrato.length} transações)
              </CardTitle>
            </CardHeader>
            <CardContent className="print:py-1">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto print:max-h-none print:overflow-visible">
                <Table>
                  <TableHeader className="sticky top-0 bg-white print:static">
                    <TableRow>
                      <TableHead className="font-semibold">Data</TableHead>
                      <TableHead className="font-semibold">Tipo</TableHead>
                      <TableHead className="font-semibold">Descrição</TableHead>
                      <TableHead className="text-right font-semibold">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.extrato.slice().reverse().map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDateShort(row.data)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              row.tipo === 'Carga' ? 'bg-green-50 text-green-700 border-green-200' :
                              row.tipo === 'Transferência' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              row.tipo === 'Taxa' ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-gray-50 text-gray-700 border-gray-200'
                            }
                          >
                            {row.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{row.descricao}</TableCell>
                        <TableCell className={`text-right font-medium ${row.valor >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatBRL(row.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* PREST. CONTAS Table — screen only, hidden in print */}
          <Card className="print:hidden">
            <CardHeader className="print:py-2">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Prestação de Contas ({data.prestacaoContas.length} despesas)
              </CardTitle>
            </CardHeader>
            <CardContent className="print:py-1">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto print:max-h-none print:overflow-visible">
                <Table>
                  <TableHeader className="sticky top-0 bg-white print:static">
                    <TableRow>
                      <TableHead className="font-semibold">Data</TableHead>
                      <TableHead className="font-semibold">Relatório</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Descrição</TableHead>
                      <TableHead className="font-semibold">Tipo</TableHead>
                      <TableHead className="text-right font-semibold">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.prestacaoContas.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDateShort(row.data)}</TableCell>
                        <TableCell className="text-sm font-medium">{row.nome_relatorio}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              row.status === 'Aprovado' || row.status === 'APROVADO' ? 'bg-green-50 text-green-700 border-green-200' :
                              row.status === 'Aberto' || row.status === 'ABERTO' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                              'bg-gray-50 text-gray-700 border-gray-200'
                            }
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{row.descricao_despesa}</TableCell>
                        <TableCell className="text-sm">{row.tipo_despesa}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatBRL(row.valor_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Print Footer — branded */}
          <div className="hidden print:block" style={{ marginTop: '24px' }}>
            <div style={{
              borderTop: '2px solid #1E3A5F',
              paddingTop: '8px',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <p style={{ fontSize: '9px', color: '#999', margin: 0 }}>
                Relatório gerado pelo Dashboard vExpenses
              </p>
              <p style={{ fontSize: '9px', color: '#999', margin: 0 }}>
                {formatTimestamp(data.exportadoEm)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <Card className="print:hidden">
          <CardContent className="py-12 flex flex-col items-center">
            <User className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              Selecione um colaborador acima para visualizar o fechamento
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Summary Card Component --------------------------------------------------

function SummaryCard({
  title,
  value,
  icon,
  variant,
  highlight,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant: 'positive' | 'negative' | 'neutral';
  highlight?: boolean;
}) {
  const colorClass =
    variant === 'positive' ? 'text-green-700' :
    variant === 'negative' ? 'text-red-700' :
    'text-gray-700';

  const bgClass = highlight ? 'bg-blue-50 border-blue-200' : '';

  return (
    <Card className={bgClass}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-500 font-medium">{title}</p>
          <span className="text-gray-400">{icon}</span>
        </div>
        <p className={`text-lg font-bold ${colorClass}`}>
          {formatBRL(value)}
        </p>
      </CardContent>
    </Card>
  );
}
