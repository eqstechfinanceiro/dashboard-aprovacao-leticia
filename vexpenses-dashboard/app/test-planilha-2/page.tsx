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

export default function TestPlanilha2Page() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [spreadsheetData2, setSpreadsheetData2] = useState<SpreadsheetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
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
        const sheetData = await fetchSpreadsheetData('planilha2');
        setSpreadsheetData2(sheetData);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);

  // Extrair regional do centro de custo
  const extractRegional = (costCenterName: string): string => {
    const siglas = ['BA', 'MG', 'RJ', 'SP', 'PR', 'SC', 'RS', 'PE', 'CE', 'GO', 'MT', 'AM', 'PA', 'MA', 'PI', 'AL', 'SE', 'RN', 'PB', 'TO', 'DF', 'ES', 'MS', 'RO', 'AC', 'RR', 'AP'];
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

    return spreadsheetData2.find(item => {
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

  // Obter classe de cor para uma célula
  const getCellColorClass = (
    member: TeamMember,
    spreadsheetData: SpreadsheetData | null,
    apiValue: any,
    spreadsheetField: keyof SpreadsheetData,
    isCalculated: boolean = false
  ): string => {
    // Se é campo calculado, retorna roxo
    if (isCalculated) {
      return 'bg-purple-100 text-purple-800 border-purple-300';
    }
    
    if (!spreadsheetData) {
      return 'bg-gray-50 text-gray-400'; // Cinza: não encontrado nesta planilha (sem erro)
    }
    
    const spreadsheetValue = spreadsheetData[spreadsheetField];
    
    if (apiValue === undefined || apiValue === null || apiValue === '') {
      return 'bg-red-100 text-red-800 border-red-300'; // Vermelho: valor não disponível na API
    }
    
    // Normalizar CPF antes de comparar (Excel pode remover zeros à esquerda)
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
        <h1 className="text-3xl font-bold">Teste Planilha 2 - CONTROLE VEXPENSES</h1>
        <p className="text-gray-600 mt-2">
          Replicação da planilha "CONTROLE - VEXPENSES - ABRIL- 2026" com dados da API VExpenses
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Informação sobre dados da API</AlertTitle>
        <AlertDescription>
          Esta página mostra dados disponíveis da API VExpenses. Campos como saldos financeiros, cargas, 
          números de cartão físico e fluxos de aprovação interna não estão disponíveis na API e são simulados para demonstração.
        </AlertDescription>
      </Alert>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Legenda de cores de comparação</AlertTitle>
        <AlertDescription className="flex flex-wrap gap-4 mt-2">
          <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800 border border-green-300 text-sm">
            Verde: Dado da API igual à planilha
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-yellow-100 text-yellow-800 border border-yellow-300 text-sm">
            Amarelo: Dado da API diferente da planilha
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-500 border border-gray-300 text-sm">
            Cinza: Pessoa não listada nesta planilha
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-800 border border-red-300 text-sm">
            Vermelho: Valor não disponível na API
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded bg-purple-100 text-purple-800 border border-purple-300 text-sm">
            Roxo: Dado calculado (fórmula)
          </span>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="painel" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="saldos">Saldos Cartão</TabsTrigger>
          <TabsTrigger value="adicionais">Adicionais</TabsTrigger>
          <TabsTrigger value="quinzenas">Quinzenas</TabsTrigger>
          <TabsTrigger value="base">Base Prest</TabsTrigger>
          <TabsTrigger value="reembolso">Reembolso</TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PAINEL - Controle Geral</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Centro Custo</TableHead>
                      <TableHead>Regional</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Status Cartão</TableHead>
                      <TableHead>Carga</TableHead>
                      <TableHead>Descarga</TableHead>
                      <TableHead>Saldo Final</TableHead>
                      <TableHead>1ª QZ</TableHead>
                      <TableHead>2ª QZ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const spreadsheetData = findSpreadsheetData(member);
                      const situacao = spreadsheetData?.situacao || (member.active ? 'ATIVO' : 'INATIVO');
                      const statusCartao = spreadsheetData?.statusCartao || '';
                      const carga = spreadsheetData?.cargaPainel ? parseFloat(spreadsheetData.cargaPainel) : null;
                      const descarga = spreadsheetData?.descarga ? parseFloat(spreadsheetData.descarga) : null;
                      const saldoFinal = spreadsheetData?.saldoFinalPainel ? parseFloat(spreadsheetData.saldoFinalPainel) : null;
                      const primeiraQz = spreadsheetData?.primeiraQz ? parseFloat(spreadsheetData.primeiraQz) : null;
                      const segundaQz = spreadsheetData?.segundaQz ? parseFloat(spreadsheetData.segundaQz) : null;
                      const regional = spreadsheetData?.regional || extractRegional(member.costCenter?.name || '');
                      return (
                        <TableRow key={member.id}>
                          <TableCell className={`font-medium ${getCellColorClass(member, spreadsheetData, member.name, 'nome')}`}>
                            {member.name}
                          </TableCell>
                          <TableCell className={getCellColorClass(member, spreadsheetData, member.cpf, 'cpf')}>
                            {member.cpf}
                          </TableCell>
                          <TableCell className={getCellColorClass(member, spreadsheetData, member.costCenter?.name || 'N/A', 'centroCusto')}>
                            {member.costCenter?.name || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {regional}
                          </TableCell>
                          <TableCell className={getCellColorClass(member, spreadsheetData, situacao, 'situacao')}>
                            <Badge variant={member.active ? "default" : "secondary"}>
                              {situacao}
                            </Badge>
                          </TableCell>
                          <TableCell className={getCellColorClass(member, spreadsheetData, statusCartao, 'statusCartao')}>
                            {statusCartao ? <Badge variant="outline">{statusCartao}</Badge> : <span className="text-gray-400">—</span>}
                          </TableCell>
                          <TableCell className="text-green-600 bg-purple-100 border-purple-300">
                            {carga !== null ? `R$ ${carga.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="text-red-600 bg-purple-100 border-purple-300">
                            {descarga !== null ? `R$ ${descarga.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="font-bold bg-purple-100 border-purple-300">
                            {saldoFinal !== null ? `R$ ${saldoFinal.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="bg-purple-100 border-purple-300">
                            {primeiraQz !== null ? `R$ ${primeiraQz.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="bg-purple-100 border-purple-300">
                            {segundaQz !== null ? `R$ ${segundaQz.toFixed(2)}` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Mostrando {teamMembers.length} registros
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="saldos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SALDO CARTÃO - Histórico de Saldos</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Dados não disponíveis na API</AlertTitle>
                <AlertDescription>
                  O histórico de saldos de cartão não está disponível na API VExpenses. Estes dados são simulados para demonstração.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Portador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Centro Custo</TableHead>
                      <TableHead>Regional</TableHead>
                      <TableHead>Status Cartão</TableHead>
                      <TableHead>Carga</TableHead>
                      <TableHead>Saldo Final</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const sd = findSpreadsheetData(member);
                      const carga = sd?.cargaPainel ? parseFloat(sd.cargaPainel) : null;
                      const saldoFinal = sd?.saldoFinalPainel ? parseFloat(sd.saldoFinalPainel) : null;
                      const regional = sd?.regional || extractRegional(member.costCenter?.name || '');
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.name}</TableCell>
                          <TableCell>{member.cpf}</TableCell>
                          <TableCell>{member.costCenter?.name || 'N/A'}</TableCell>
                          <TableCell>{regional}</TableCell>
                          <TableCell>
                            {sd?.statusCartao ? <Badge variant="outline">{sd.statusCartao}</Badge> : <span className="text-gray-400">—</span>}
                          </TableCell>
                          <TableCell className="text-green-600">
                            {carga !== null ? `R$ ${carga.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="font-bold">
                            {saldoFinal !== null ? `R$ ${saldoFinal.toFixed(2)}` : '—'}
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

        <TabsContent value="adicionais" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ADICIONAIS - Cargas Adicionais</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Dados não disponíveis na API</AlertTitle>
                <AlertDescription>
                  Os dados de cargas adicionais e aprovações internas não estão disponíveis na API VExpenses. Estes dados são simulados para demonstração.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Mês</TableHead>
                      <TableHead>Centro Custo</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const sd = findSpreadsheetData(member);
                      const carga = sd?.cargaPainel ? parseFloat(sd.cargaPainel) : null;
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.name}</TableCell>
                          <TableCell>{member.cpf}</TableCell>
                          <TableCell className="text-green-600">
                            {carga !== null ? `R$ ${carga.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>{member.costCenter?.name || 'N/A'}</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>
                            <Badge variant="outline">Não disponível</Badge>
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

        <TabsContent value="quinzenas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>QUINZENAS - Controle de Quinzenas</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Cálculo implementado</AlertTitle>
                <AlertDescription>
                  As quinzenas são calculadas automaticamente com base na data (1ª QZ: dias 1-15, 2ª QZ: dias 16-31).
                </AlertDescription>
              </Alert>
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Quinzena</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Mês</TableHead>
                      <TableHead>Ano</TableHead>
                      <TableHead>Regional</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const sd = findSpreadsheetData(member);
                      const primeiraQz = sd?.primeiraQz ? parseFloat(sd.primeiraQz) : null;
                      const segundaQz = sd?.segundaQz ? parseFloat(sd.segundaQz) : null;
                      const regional = sd?.regional || extractRegional(member.costCenter?.name || '');
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.name}</TableCell>
                          <TableCell>{member.cpf}</TableCell>
                          <TableCell className="text-green-600">
                            {primeiraQz !== null ? `R$ ${primeiraQz.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">1ª QZ</Badge>
                          </TableCell>
                          <TableCell>01/04/2026</TableCell>
                          <TableCell>ABRIL</TableCell>
                          <TableCell>2026</TableCell>
                          <TableCell>{regional}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="base" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>BASE PREST - Base de Prestação de Contas</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Informação</AlertTitle>
                <AlertDescription>
                  Esta aba contém a base de dados para prestação de contas. Os dados mostrados são dos colaboradores disponíveis na API.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Centro Custo</TableHead>
                      <TableHead>Regional</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.cpf}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>{member.costCenter?.name || 'N/A'}</TableCell>
                        <TableCell>{extractRegional(member.costCenter?.name || '')}</TableCell>
                        <TableCell>
                          <Badge variant={member.active ? "default" : "secondary"}>
                            {member.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reembolso" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>REEMBOLSO - Controle de Reembolsos</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Dados não disponíveis na API</AlertTitle>
                <AlertDescription>
                  Os dados de reembolso não estão disponíveis na API VExpenses. Estes dados são gerenciados internamente pelo sistema financeiro.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Valor Reembolso</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.cpf}</TableCell>
                        <TableCell className="text-gray-400">—</TableCell>
                        <TableCell className="text-gray-400">—</TableCell>
                        <TableCell>
                          <Badge variant="outline">Não disponível</Badge>
                        </TableCell>
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
