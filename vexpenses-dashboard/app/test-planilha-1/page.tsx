'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, AlertTriangle } from 'lucide-react';
import { compareWithSpreadsheet, getDataMatchColorClass, DataMatchType, fetchSpreadsheetData, SpreadsheetData } from '@/lib/spreadsheet-data';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  cpf: string;
  costCenter: {
    id: string;
    name: string;
  };
  user_type: string;
  active: boolean;
}

interface CostCenter {
  id: string;
  name: string;
  code: string;
}

export default function TestPlanilha1Page() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [spreadsheetData1, setSpreadsheetData1] = useState<SpreadsheetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Buscar dados da API VExpenses
        const [membersRes, centersRes] = await Promise.all([
          fetch('/api/vexpenses/team-members'),
          fetch('/api/vexpenses/costs-centers')
        ]);
        
        if (!membersRes.ok || !centersRes.ok) {
          throw new Error('Failed to fetch data from VExpenses API');
        }
        
        const membersData = await membersRes.json();
        const centersData = await centersRes.json();
        
        setTeamMembers(membersData.data || []);
        setCostCenters(centersData.data || []);
        
        // Buscar dados da planilha
        const sheetData = await fetchSpreadsheetData('planilha1');
        setSpreadsheetData1(sheetData);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);

  // Buscar dados financeiros da aba 1 QZ VEXPENSES (sempre têm CPF)
  const findQuinzenaData = (member: TeamMember): SpreadsheetData | null => {
    const memberCpfNorm = normalizeCPF(member.cpf);
    if (!memberCpfNorm) return null;
    return spreadsheetData1.find(item => {
      const itemCpfNorm = normalizeCPF(item.cpf);
      return !!itemCpfNorm && memberCpfNorm === itemCpfNorm;
    }) || null;
  };

  // Extrair regional do centro de custo
  const extractRegional = (costCenterName: string): string => {
    const siglas = ['BA', 'MG', 'RJ', 'SP', 'PR', 'SC', 'RS', 'PE', 'CE', 'GO', 'MT', 'AM', 'PA'];
    for (const sigla of siglas) {
      if (costCenterName.toUpperCase().includes(sigla)) {
        return sigla;
      }
    }
    return 'N/A';
  };

  // Normalizar string para comparação (remover acentos, espaços extras, case insensitive)
  const normalizeString = (str: string | null | undefined): string => {
    if (!str) return '';
    return str
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .trim()
      .replace(/\s+/g, ''); // Remove espaços extras
  };

  // Normalizar CPF (remover pontos e traços)
  const normalizeCPF = (cpf: string | null | undefined): string => {
    if (!cpf) return '';
    return cpf.toString().replace(/\D/g, ''); // Remove não-dígitos
  };

  // Encontrar dado correspondente na planilha com matching mais flexível
  const findSpreadsheetData = (member: TeamMember): SpreadsheetData | null => {
    const memberNameNorm = normalizeString(member.name);
    const memberCpfNorm = normalizeCPF(member.cpf);

    return spreadsheetData1.find(item => {
      const itemNameNorm = normalizeString(item.nome);
      const itemCpfNorm = normalizeCPF(item.cpf);
      
      // Match por CPF normalizado (prioridade)
      if (memberCpfNorm && itemCpfNorm && memberCpfNorm === itemCpfNorm) {
        return true;
      }
      
      // Match por nome normalizado (similaridade aproximada)
      if (memberNameNorm && itemNameNorm) {
        // Match exato normalizado
        if (memberNameNorm === itemNameNorm) {
          return true;
        }
        
        // Match por substring (nome contém parte do outro)
        if (itemNameNorm.includes(memberNameNorm) || memberNameNorm.includes(itemNameNorm)) {
          return true;
        }
      }
      
      return false;
    }) || null;
  };

  // Cor base do campo: azul = dado bruto, roxo = calculado
  const getFieldBaseColor = (fieldName: string): string => {
    const calculatedFields = ['cargaParcial', 'cargaFinal'];
    if (calculatedFields.includes(fieldName)) {
      return 'bg-purple-100 text-purple-800 border-purple-300';
    }
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };

  // Obter classe de cor para validação API x Planilha (borda/indicador)
  const getValidationColorClass = (
    member: TeamMember,
    spreadsheetData: SpreadsheetData | null,
    apiValue: any,
    spreadsheetField: keyof SpreadsheetData
  ): string => {
    if (!spreadsheetData) {
      return 'bg-gray-50 text-gray-400'; // Cinza: não encontrado nesta planilha
    }

    const spreadsheetValue = spreadsheetData[spreadsheetField];

    if (apiValue === undefined || apiValue === null || apiValue === '') {
      return 'bg-red-100 text-red-800 border-red-300'; // Vermelho: não disponível na API
    }

    // Normalizar CPF antes de comparar
    let apiValueToCompare = apiValue;
    let spreadsheetValueToCompare = spreadsheetValue;
    if (spreadsheetField === 'cpf') {
      apiValueToCompare = normalizeCPF(String(apiValue));
      spreadsheetValueToCompare = normalizeCPF(String(spreadsheetValue ?? ''));
    }

    if (apiValueToCompare === spreadsheetValueToCompare) {
      return 'bg-green-100 text-green-800 border-green-300'; // Verde: igual
    }

    return 'bg-yellow-100 text-yellow-800 border-yellow-300'; // Amarelo: diferente
  };

  // Fórmula: CARGA PARCIAL = 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
  const calcularCargaParcial = (
    qzAbril26: number | null,
    saldoFinal: number | null,
    saldoCartao: number | null,
    adiantamento: number | null
  ): number | null => {
    if (qzAbril26 === null || saldoFinal === null || saldoCartao === null) return null;
    const adiant = adiantamento || 0;
    return qzAbril26 - saldoFinal - saldoCartao - adiant;
  };

  // Fórmula: CARGA FINAL = IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO
  const calcularCargaFinal = (
    cargaParcial: number | null,
    reembolso: number | null
  ): number | null => {
    if (cargaParcial === null) return null;
    const reemb = reembolso || 0;
    const cargaEfetiva = cargaParcial < 0 ? 0 : cargaParcial;
    return cargaEfetiva + reemb;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Carregando dados...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Erro</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Teste Planilha 1 - 1QZ ABRIL 2026</h1>
        <p className="text-gray-600 mt-2">
          Replicação da planilha "1QZ ABRIL 2026 - VEXPENSES" com dados da API VExpenses
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Informação sobre dados da API</AlertTitle>
        <AlertDescription>
          Esta página mostra dados disponíveis da API VExpenses. Campos como saldos, cargas e status do cartão físico 
          não estão disponíveis na API e são simulados para demonstração.
        </AlertDescription>
      </Alert>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Legenda de cores da planilha</AlertTitle>
        <AlertDescription className="flex flex-wrap gap-4 mt-2">
          <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800 border border-blue-300 text-sm">
            Azul: Dado bruto (da planilha/API)
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-purple-100 text-purple-800 border border-purple-300 text-sm">
            Roxo: Dado calculado (fórmula)
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800 border border-green-300 text-sm">
            Verde: API = Planilha
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-yellow-100 text-yellow-800 border border-yellow-300 text-sm">
            Amarelo: API ≠ Planilha
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-500 border border-gray-300 text-sm">
            Cinza: Não listado nesta planilha
          </span>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="quinzena" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="quinzena">1ª QZ VEXPENSES</TabsTrigger>
          <TabsTrigger value="cadastro1">Cadastro 1</TabsTrigger>
          <TabsTrigger value="cadastro2">Cadastro 2</TabsTrigger>
          <TabsTrigger value="cadastro3">Cadastro 3</TabsTrigger>
          <TabsTrigger value="agillitas">Validação Agillitas</TabsTrigger>
        </TabsList>

        <TabsContent value="quinzena" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1ª QZ VEXPENSES 04_2026 — Réplica completa da planilha</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Portador</TableHead>
                      <TableHead className="whitespace-nowrap">CPF</TableHead>
                      <TableHead className="whitespace-nowrap">Status Colab</TableHead>
                      <TableHead className="whitespace-nowrap">Centro Custo</TableHead>
                      <TableHead className="whitespace-nowrap">Cod Centro Custo</TableHead>
                      <TableHead className="whitespace-nowrap">Gestor</TableHead>
                      <TableHead className="whitespace-nowrap">Direção</TableHead>
                      <TableHead className="whitespace-nowrap">Saldo Reembolsar</TableHead>
                      <TableHead className="whitespace-nowrap">Saldo Final</TableHead>
                      <TableHead className="whitespace-nowrap">1QZ Abril 26</TableHead>
                      <TableHead className="whitespace-nowrap">Saldo Cartão</TableHead>
                      <TableHead className="whitespace-nowrap">Adiantamento</TableHead>
                      <TableHead className="whitespace-nowrap">Carga Parcial</TableHead>
                      <TableHead className="whitespace-nowrap">Reembolso</TableHead>
                      <TableHead className="whitespace-nowrap">Carga Final</TableHead>
                      <TableHead className="whitespace-nowrap">Status Cartão</TableHead>
                      <TableHead className="whitespace-nowrap">Obs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const qzData = findQuinzenaData(member);

                      // Dados brutos da planilha
                      const statusColab = qzData?.statusColab || (member.active ? 'ATIVO' : 'INATIVO');
                      const centroCusto = qzData?.centroCusto || member.costCenter?.name || '';
                      const codCentroCusto = qzData?.codCentroCusto || '';
                      const gestor = qzData?.gestor || '';
                      const direcao = qzData?.direcao || '';

                      const saldoReembolsar = qzData?.saldoReembolsar ? parseFloat(qzData.saldoReembolsar) : null;
                      const saldoFinal = qzData?.saldoFinal ? parseFloat(qzData.saldoFinal) : null;
                      const qzAbril26 = qzData?.qzAbril26 ? parseFloat(qzData.qzAbril26) : null;
                      const saldoCartao = qzData?.saldoCartao ? parseFloat(qzData.saldoCartao) : null;
                      const adiantamento = qzData?.adiantamento ? parseFloat(qzData.adiantamento) : null;
                      const reembolso = qzData?.reembolso ? parseFloat(qzData.reembolso) : null;
                      const statusCartao = qzData?.statusCartao || '';
                      const obs = qzData?.obs || '';

                      // Cálculos automáticos (fórmulas da planilha)
                      const cargaParcial = calcularCargaParcial(qzAbril26, saldoFinal, saldoCartao, adiantamento);
                      const cargaFinal = calcularCargaFinal(cargaParcial, reembolso);

                      // Helper para formatar valor monetário
                      const fmt = (v: number | null) => v !== null ? `R$ ${v.toFixed(2)}` : '—';

                      return (
                        <TableRow key={member.id}>
                          {/* Portador - validação API x Planilha */}
                          <TableCell className={`font-medium whitespace-nowrap ${getValidationColorClass(member, qzData, member.name, 'nome')}`}>
                            {member.name}
                          </TableCell>
                          {/* CPF - validação API x Planilha */}
                          <TableCell className={`whitespace-nowrap ${getValidationColorClass(member, qzData, member.cpf, 'cpf')}`}>
                            {member.cpf}
                          </TableCell>
                          {/* Status Colab - dado bruto (azul) */}
                          <TableCell className={getFieldBaseColor('statusColab')}>
                            <Badge variant={statusColab === 'ATIVO' ? "default" : "secondary"}>{statusColab}</Badge>
                          </TableCell>
                          {/* Centro Custo - dado bruto (azul) */}
                          <TableCell className={`whitespace-nowrap ${getFieldBaseColor('centroCusto')}`}>
                            {centroCusto || '—'}
                          </TableCell>
                          {/* Cod Centro Custo - dado bruto (azul) */}
                          <TableCell className={getFieldBaseColor('codCentroCusto')}>
                            {codCentroCusto || '—'}
                          </TableCell>
                          {/* Gestor - dado bruto (azul) */}
                          <TableCell className={getFieldBaseColor('gestor')}>
                            {gestor || '—'}
                          </TableCell>
                          {/* Direção - dado bruto (azul) */}
                          <TableCell className={getFieldBaseColor('direcao')}>
                            {direcao || '—'}
                          </TableCell>
                          {/* Saldo Reembolsar - dado bruto (azul) */}
                          <TableCell className={`whitespace-nowrap ${getFieldBaseColor('saldoReembolsar')} ${saldoReembolsar !== null && saldoReembolsar < 0 ? 'text-red-600 font-semibold' : ''}`}>
                            {fmt(saldoReembolsar)}
                          </TableCell>
                          {/* Saldo Final - dado bruto (azul) */}
                          <TableCell className={`whitespace-nowrap ${getFieldBaseColor('saldoFinal')}`}>
                            {fmt(saldoFinal)}
                          </TableCell>
                          {/* 1QZ Abril 26 - dado bruto (azul) */}
                          <TableCell className={`whitespace-nowrap ${getFieldBaseColor('qzAbril26')}`}>
                            {fmt(qzAbril26)}
                          </TableCell>
                          {/* Saldo Cartão - dado bruto (azul) */}
                          <TableCell className={`whitespace-nowrap ${getFieldBaseColor('saldoCartao')}`}>
                            {fmt(saldoCartao)}
                          </TableCell>
                          {/* Adiantamento - dado bruto (azul) */}
                          <TableCell className={`whitespace-nowrap ${getFieldBaseColor('adiantamento')}`}>
                            {fmt(adiantamento)}
                          </TableCell>
                          {/* Carga Parcial - CALCULADO (roxo) */}
                          <TableCell className={`whitespace-nowrap font-semibold ${getFieldBaseColor('cargaParcial')} ${cargaParcial !== null && cargaParcial < 0 ? 'text-red-600' : ''}`}>
                            {fmt(cargaParcial)}
                          </TableCell>
                          {/* Reembolso - dado bruto (azul) */}
                          <TableCell className={`whitespace-nowrap ${getFieldBaseColor('reembolso')}`}>
                            {fmt(reembolso)}
                          </TableCell>
                          {/* Carga Final - CALCULADO (roxo) */}
                          <TableCell className={`whitespace-nowrap font-semibold ${getFieldBaseColor('cargaFinal')}`}>
                            {fmt(cargaFinal)}
                          </TableCell>
                          {/* Status Cartão - dado bruto (azul) */}
                          <TableCell className={getFieldBaseColor('statusCartao')}>
                            {statusCartao ? <Badge variant="outline">{statusCartao}</Badge> : <span className="text-gray-400">—</span>}
                          </TableCell>
                          {/* OBS - dado bruto (azul) */}
                          <TableCell className={`whitespace-nowrap ${getFieldBaseColor('obs')}`}>
                            {obs || '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Mostrando {teamMembers.length} registros — 17 colunas (replicação completa da planilha)
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Fórmulas: Carga Parcial = 1QZ – Saldo Final – Saldo Cartão – Adiantamento &nbsp;|&nbsp;
                Carga Final = MAX(0, Carga Parcial) + Reembolso
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cadastro1" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Planilha1 - Cadastro de Usuários</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Tipo Usuário</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Centro Custo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const spreadsheetData = findSpreadsheetData(member);
                      return (
                        <TableRow key={member.id}>
                          <TableCell className={`font-medium ${getValidationColorClass(member, spreadsheetData, member.name, 'nome')}`}>
                            {member.name}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.email, 'email')}>
                            {member.email}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.user_type || 'Normal', 'tipoUsuario')}>
                            {member.user_type || 'Normal'}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.cpf, 'cpf')}>
                            {member.cpf}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.costCenter?.name || 'N/A', 'centroCusto')}>
                            {member.costCenter?.name || 'N/A'}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.active ? 'Ativo' : 'Inativo', 'statusCartao')}>
                            <Badge variant={member.active ? "default" : "secondary"}>
                              {member.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cadastro2" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Planilha2 - Cadastro de Usuários</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Informação</AlertTitle>
                <AlertDescription>
                  Esta aba é idêntica à Planilha1. Mostrando os mesmos dados da API.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Tipo Usuário</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Centro Custo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const spreadsheetData = findSpreadsheetData(member);
                      return (
                        <TableRow key={member.id}>
                          <TableCell className={`font-medium ${getValidationColorClass(member, spreadsheetData, member.name, 'nome')}`}>
                            {member.name}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.email, 'email')}>
                            {member.email}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.user_type || 'Normal', 'tipoUsuario')}>
                            {member.user_type || 'Normal'}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.cpf, 'cpf')}>
                            {member.cpf}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.costCenter?.name || 'N/A', 'centroCusto')}>
                            {member.costCenter?.name || 'N/A'}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.active ? 'Ativo' : 'Inativo', 'statusCartao')}>
                            <Badge variant={member.active ? "default" : "secondary"}>
                              {member.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cadastro3" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Planilha3 - Cadastro de Usuários</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Informação</AlertTitle>
                <AlertDescription>
                  Esta aba é idêntica às Planilhas 1 e 2. Mostrando os mesmos dados da API.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Tipo Usuário</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Centro Custo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const spreadsheetData = findSpreadsheetData(member);
                      return (
                        <TableRow key={member.id}>
                          <TableCell className={`font-medium ${getValidationColorClass(member, spreadsheetData, member.name, 'nome')}`}>
                            {member.name}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.email, 'email')}>
                            {member.email}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.user_type || 'Normal', 'tipoUsuario')}>
                            {member.user_type || 'Normal'}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.cpf, 'cpf')}>
                            {member.cpf}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.costCenter?.name || 'N/A', 'centroCusto')}>
                            {member.costCenter?.name || 'N/A'}
                          </TableCell>
                          <TableCell className={getValidationColorClass(member, spreadsheetData, member.active ? 'Ativo' : 'Inativo', 'statusCartao')}>
                            <Badge variant={member.active ? "default" : "secondary"}>
                              {member.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agillitas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validação Agillitas</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Dados não disponíveis na API</AlertTitle>
                <AlertDescription>
                  Os dados de validação Agillitas (número do cartão físico, validações externas) não estão disponíveis na API VExpenses.
                  Estes dados são gerenciados externamente pelo sistema Agillitas.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Portador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Cartão VExpenses</TableHead>
                      <TableHead>Cartão Agillitas</TableHead>
                      <TableHead>Situação CPF</TableHead>
                      <TableHead>Situação Nome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.cpf}</TableCell>
                        <TableCell className="text-gray-400">Não disponível</TableCell>
                        <TableCell className="text-gray-400">Não disponível</TableCell>
                        <TableCell className="text-gray-400">Não disponível</TableCell>
                        <TableCell className="text-gray-400">Não disponível</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
