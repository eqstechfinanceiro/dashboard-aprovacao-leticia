'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  FileText, 
  Clock, 
  User, 
  AlertCircle, 
  Download, 
  Eye, 
  Search,
  Filter,
  ChevronDown,
  Calendar,
  Building2
} from 'lucide-react';
import { usePendingReports, useReportDetails, useApproveReport } from '@/lib/hooks';

interface Report {
  id: number;
  description: string;
  status: string;
  user: {
    data: {
      name: string;
      email: string;
    };
  };
  pdf_link: string;
  excel_link: string;
  created_at: string;
  approval_date: string | null;
  approval_stage_id: number | null;
  observation: string | null;
  justification: string | null;
}

export default function AprovacoesPage() {
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [observation, setObservation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ABERTO' | 'APROVADO' | 'REPROVADO'>('ABERTO');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  const { data: reports = [], isLoading, refetch } = usePendingReports();
  const { data: reportDetails } = useReportDetails(selectedReport?.id || 0);
  const { approveReport, rejectReport } = useApproveReport();
  
  // Filtrar relatórios
  const filteredReports = useMemo(() => {
    let filtered = [...reports];
    
    // Filtro de status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    
    // Filtro de busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.description?.toLowerCase().includes(term) ||
        r.user?.data?.name?.toLowerCase().includes(term) ||
        r.justification?.toLowerCase().includes(term)
      );
    }
    
    // Filtro de data
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(r => {
        const reportDate = new Date(r.created_at);
        
        switch (dateFilter) {
          case 'today':
            return reportDate >= today;
          case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return reportDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return reportDate >= monthAgo;
          default:
            return true;
        }
      });
    }
    
    return filtered;
  }, [reports, statusFilter, searchTerm, dateFilter]);
  
  // Paginação
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReports.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReports, currentPage]);
  
  // Calcular totais
  const totals = useMemo(() => {
    return {
      pending: reports.filter(r => r.status === 'ABERTO').length,
      approved: reports.filter(r => r.status === 'APROVADO').length,
      rejected: reports.filter(r => r.status === 'REPROVADO').length,
      total: reports.length,
      users: new Set(reports.map(r => r.user?.data?.name)).size,
    };
  }, [reports]);

  const handleApprove = async () => {
    if (!selectedReport) return;
    
    try {
      await approveReport(selectedReport.id, observation);
      setShowApprovalModal(false);
      setObservation('');
      setSelectedReport(null);
      refetch();
    } catch (error) {
      console.error('Erro ao aprovar:', error);
    }
  };

  const handleReject = async () => {
    if (!selectedReport) return;
    
    try {
      await rejectReport(selectedReport.id, observation);
      setShowApprovalModal(false);
      setObservation('');
      setSelectedReport(null);
      refetch();
    } catch (error) {
      console.error('Erro ao reprovar:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APROVADO':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Aprovado
          </Badge>
        );
      case 'REPROVADO':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Reprovado
          </Badge>
        );
      case 'ABERTO':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200">
            {status}
          </Badge>
        );
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('ABERTO');
    setDateFilter('all');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Aprovações</h1>
          <p className="text-gray-600 mt-1">Gerencie e aprove relatórios de despesas</p>
        </div>
        <Button
          onClick={() => setShowFilters(!showFilters)}
          variant={showFilters ? "default" : "outline"}
          className="w-full sm:w-auto"
        >
          <Filter className="h-4 w-4 mr-2" />
          Filtros
          <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-blue-100 uppercase tracking-wide mb-4">Total</p>
            <p className="text-4xl font-bold">{totals.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-yellow-100 uppercase tracking-wide mb-4">Pendentes</p>
            <p className="text-4xl font-bold">{totals.pending}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-green-100 uppercase tracking-wide mb-4">Aprovados</p>
            <p className="text-4xl font-bold">{totals.approved}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-red-100 uppercase tracking-wide mb-4">Reprovados</p>
            <p className="text-4xl font-bold">{totals.rejected}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
          <CardContent className="p-6 pt-8 pb-8 flex flex-col items-center justify-center text-center min-h-[140px]">
            <p className="text-sm font-medium text-purple-100 uppercase tracking-wide mb-4">Usuários</p>
            <p className="text-4xl font-bold">{totals.users}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card className="border-2 border-blue-200">
          <CardContent className="p-6 pt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Buscar
                </label>
                <Input
                  placeholder="Descrição, usuário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  <option value="ABERTO">Pendentes</option>
                  <option value="APROVADO">Aprovados</option>
                  <option value="REPROVADO">Reprovados</option>
                </select>
              </div>
              
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Período
                </label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos</option>
                  <option value="today">Hoje</option>
                  <option value="week">Última semana</option>
                  <option value="month">Último mês</option>
                </select>
              </div>
              
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700">Ações</label>
                <Button
                  onClick={resetFilters}
                  variant="outline"
                  className="w-full"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Relatórios */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Relatórios</CardTitle>
              <CardDescription>
                {filteredReports.length} de {totals.total} relatórios
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600 font-medium">Carregando relatórios...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium text-lg">Nenhum relatório encontrado</p>
              <p className="text-gray-400 text-sm mt-2">Tente ajustar os filtros ou a busca</p>
              <Button
                onClick={resetFilters}
                variant="outline"
                className="mt-4"
              >
                Limpar Filtros
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedReports.map((report) => (
                <div
                  key={report.id}
                  className="group border rounded-xl p-4 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer bg-white hover:bg-blue-50"
                  onClick={() => setSelectedReport(report)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                          {report.description}
                        </h3>
                        {getStatusBadge(report.status)}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                        <div className="flex items-center gap-1.5">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{report.user?.data?.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>{formatDate(report.created_at)}</span>
                        </div>
                      </div>
                      
                      {report.observation && (
                        <div className="flex items-start gap-2 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <p className="line-clamp-2">{report.observation}</p>
                        </div>
                      )}
                      
                      {report.justification && (
                        <div className="flex items-start gap-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-2 mt-2">
                          <FileText className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <p className="line-clamp-2">{report.justification}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(report.pdf_link, '_blank');
                        }}
                        className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(report.excel_link, '_blank');
                        }}
                        className="hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Excel
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <p className="text-sm text-gray-600">
                    Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredReports.length)} de {filteredReports.length}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <Button
                        key={pageNum}
                        size="sm"
                        variant={currentPage === pageNum ? "default" : "outline"}
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhes do Relatório */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedReport.description}</h2>
                  <p className="text-sm text-gray-500 mt-1">ID: {selectedReport.id}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedReport(null)}
                  className="rounded-full hover:bg-gray-100"
                >
                  ✕
                </Button>
              </div>

              <div className="space-y-6">
                {/* Status Badge */}
                <div className="flex justify-center">
                  {getStatusBadge(selectedReport.status)}
                </div>

                {/* Informações Básicas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-6">
                    <p className="text-sm font-medium text-gray-600 mb-3">Usuário</p>
                    <p className="text-lg font-semibold text-gray-900">{selectedReport.user?.data?.name}</p>
                    <p className="text-sm text-gray-500">{selectedReport.user?.data?.email}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-6">
                    <p className="text-sm font-medium text-gray-600 mb-3">Data de Criação</p>
                    <p className="text-lg font-semibold text-gray-900">{formatDate(selectedReport.created_at)}</p>
                  </div>
                </div>

                {/* Links dos Documentos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    onClick={() => window.open(selectedReport.pdf_link, '_blank')}
                    className="h-12 text-base font-medium"
                  >
                    <Eye className="h-5 w-5 mr-2" />
                    Visualizar PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(selectedReport.excel_link, '_blank')}
                    className="h-12 text-base font-medium"
                  >
                    <Download className="h-5 w-5 mr-2" />
                    Baixar Excel
                  </Button>
                </div>

                {/* Observações */}
                {selectedReport.observation && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                    <h4 className="font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Observação
                    </h4>
                    <p className="text-yellow-900">{selectedReport.observation}</p>
                  </div>
                )}

                {selectedReport.justification && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Justificativa
                    </h4>
                    <p className="text-blue-900">{selectedReport.justification}</p>
                  </div>
                )}

                {/* Ações de Aprovação */}
                <div className="flex gap-4 pt-4 border-t">
                  <Button
                    onClick={() => {
                      setShowApprovalModal(true);
                      setObservation('');
                    }}
                    className="flex-1 h-12 text-base font-medium"
                    size="lg"
                  >
                    Revisar e Aprovar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Aprovação */}
      {showApprovalModal && selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Aprovar Relatório</h3>
            <p className="text-gray-600 mb-6">
              Deseja aprovar o relatório <strong className="text-gray-900">{selectedReport.description}</strong>?
            </p>
            
            <textarea
              className="w-full border border-gray-300 rounded-xl p-4 mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
              placeholder="Adicione uma observação (opcional)..."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
            
            <div className="flex gap-3">
              <Button
                onClick={handleApprove}
                className="flex-1 bg-green-600 hover:bg-green-700 h-12 text-base font-medium"
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Aprovar
              </Button>
              <Button
                onClick={handleReject}
                variant="destructive"
                className="flex-1 h-12 text-base font-medium"
              >
                <XCircle className="h-5 w-5 mr-2" />
                Reprovar
              </Button>
              <Button
                onClick={() => {
                  setShowApprovalModal(false);
                  setObservation('');
                }}
                variant="outline"
                className="h-12"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
