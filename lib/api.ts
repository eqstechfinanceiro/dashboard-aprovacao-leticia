import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// Log para debug (remover em produção)
console.log('[API Client] API_KEY exists:', !!API_KEY);
console.log('[API Client] API_KEY length:', API_KEY?.length);
console.log('[API Client] API_KEY prefix:', API_KEY?.substring(0, 10));

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  },
});

// Tipos de resposta da API
export interface ApiResponse<T> {
  request: string;
  method: string;
  success: boolean;
  code: number;
  message: string;
  data: T;
}

// Tipos de dados da API

// Team Members
export interface TeamMember {
  id: number;
  integration_id: string;
  external_id: string;
  company_id: number;
  role_id: number;
  approval_flow_id: number;
  expense_limit_policy_id: number;
  user_type: string;
  name: string;
  email: string;
  cpf: number;
  phone1: string;
  phone2: string;
  birth_date: string;
  bank: string;
  agency: string;
  account: string;
  pix_key: string;
  confirmed: boolean;
  active: boolean;
  parameters: Record<string, string>;
  created_at: string;
  updated_at: string;
  costsCenters?: CostCenter[];
  projects?: Project[];
}

export interface TeamMemberParameter {
  name: string;
  label: string;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberCreate {
  external_id: string;
  user_type: string;
  name: string;
  email: string;
  password: string;
  birth_date: string;
  integration_id?: string;
  approval_flow_id?: number;
  expense_limit_policy_id?: number;
  cpf?: number;
  phone1?: string;
  phone2?: string;
  bank?: string;
  agency?: string;
  account?: string;
  pix_key?: string;
  active?: boolean;
  parameters?: Record<string, string>;
  send_welcome_email?: boolean;
}

export interface TeamMemberUpdate {
  integration_id?: string;
  external_id?: string;
  approval_flow_id?: number;
  expense_limit_policy_id?: number;
  user_type?: string;
  name?: string;
  email?: string;
  password?: string;
  cpf?: number;
  phone1?: string;
  phone2?: string;
  birth_date?: string;
  bank?: string;
  agency?: string;
  account?: string;
  pix_key?: string;
  active?: boolean;
  parameters?: Record<string, string>;
  send_welcome_email?: boolean;
}

// Cost Centers
export interface CostCenter {
  id: number;
  integration_id: number;
  name: string;
  company_group_id: number;
  on: boolean;
}

export interface CostCenterCreate {
  name: string;
  integration_id?: string;
}

export interface CostCenterUpdate {
  name?: string;
  integration_id?: string;
}

// Projects
export interface Project {
  id: number;
  name: string;
  company_name: string;
  cnpj: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: number;
  phone1: number;
  phone2: number;
  on: boolean;
}

export interface ProjectCreate {
  name: string;
  company_name?: string;
  cnpj?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: number;
  phone1?: number;
  phone2?: number;
  integration_id?: string;
}

export interface ProjectUpdate {
  name?: string;
  company_name?: string;
  cnpj?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: number;
  phone1?: number;
  phone2?: number;
  integration_id?: string;
}

// Approval Flows
export interface ApprovalFlowStep {
  operator: string;
  entrance_value: number;
  order: number;
  groups: {
    operator: string;
    approvers: string[];
  }[];
}

export interface ApprovalFlow {
  id: number;
  company_id: number;
  description: string;
  external_id: string;
  steps: ApprovalFlowStep[];
}

export interface ApprovalFlowCreate {
  description: string;
  external_id?: string;
  steps: ApprovalFlowStep[];
}

export interface ApprovalFlowUpdate {
  description?: string;
  external_id?: string;
  steps?: ApprovalFlowStep[];
}

// Expenses
export interface Apportionment {
  id: number;
  integration_id: number;
  expense_id: number;
  reimbursable_company_id: number;
  percentage: number;
  description: string;
  on: boolean;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: number;
  user_id: number;
  expense_id: number;
  report_id: number;
  device_id: number;
  integration_id: number;
  external_id: string;
  expense_type_id: number;
  payment_method_id: number;
  paying_company_id: number;
  route_id: number;
  receipt_url: string;
  date: string;
  value: number;
  title: string;
  validate: string;
  observation: string;
  rejected: number;
  on: boolean;
  reimbursable: boolean;
  mileage: number;
  mileage_value: number;
  original_currency_iso: string;
  exchange_rate: number;
  converted_value: number;
  converted_currency_iso: string;
  created_at: string;
  updated_at: string;
  apportionment?: Apportionment[];
  user?: { data: TeamMember };
  expense_type?: { data: ExpenseType };
  costs_center?: { data: CostCenter };
  payment_method?: { data: PaymentMethod };
  report?: { data: Report };
}

export interface ExpenseCreate {
  user_id: number;
  external_id: string;
  expense_type_id?: number;
  payment_method_id?: number;
  paying_company_id: number;
  route_id?: number;
  receipt_url?: string;
  date: string;
  value: number;
  report_id?: number;
  title: string;
  validate?: string;
  observation?: string;
  reimbursable?: boolean;
  mileage?: number;
  mileage_value?: number;
  original_currency_iso?: string;
  exchange_rate?: number;
  converted_value?: number;
  converted_currency_iso?: string;
  apportionment?: {
    reimbursable_company_id: number;
    percentage: number;
  }[];
}

export interface ExpenseUpdate {
  user_id?: number;
  external_id?: string;
  expense_type_id?: number;
  payment_method_id?: number;
  paying_company_id?: number;
  route_id?: number;
  receipt_url?: string;
  date?: string;
  value?: number;
  report_id?: number;
  title?: string;
  validate?: string;
  observation?: string;
  reimbursable?: boolean;
  mileage?: number;
  mileage_value?: number;
  original_currency_iso?: string;
  exchange_rate?: number;
  converted_value?: number;
  converted_currency_iso?: string;
  apportionment?: {
    reimbursable_company_id: number;
    percentage: number;
  }[];
}

// Expense Types
export interface ExpenseType {
  id: number;
  integration_id: number;
  description: string;
  on: boolean;
}

export interface ExpenseTypeCreate {
  description: string;
  integration_id?: string;
}

export interface ExpenseTypeUpdate {
  description?: string;
  integration_id?: string;
}

// Currencies
export interface Currency {
  priority: number;
  iso_code: string;
  name: string;
  symbol: string;
  subunit: string;
  subunit_to_unit: number;
  symbol_first: boolean;
  html_entity: string;
  decimal_mark: string;
  thousands_separator: string;
  iso_numeric: number;
}

// Advances
export interface Advance {
  id: string;
  description: string;
  advance_user_id: number;
  registration_user_id: number;
  release_date: string;
  value: number;
  original_currency_iso: string;
  advance_number: number;
  advance_report_id: number;
  created_at: string;
  updated_at: string;
}

export interface AdvanceCreate {
  description: string;
  advance_user_id: string;
  advance_date: string;
  value: number;
  currency_iso: string;
  creator_user_id?: string;
}

// Reports
export interface Report {
  id: number;
  external_id: string;
  user_id: number;
  device_id: number;
  description: string;
  status: 'ABERTO' | 'APROVADO' | 'REPROVADO' | 'REABERTO' | 'PAGO' | 'ENVIADO';
  approval_stage_id: number;
  approval_user_id: number;
  approval_date: string;
  paying_company_id: number;
  payment_date: string;
  payment_method_id: number;
  observation: string;
  on: boolean;
  justification: string;
  pdf_link: string;
  excel_link: string;
  created_at: string;
  updated_at: string;
  user?: { data: TeamMember };
  expenses?: { data: Expense[] };
  expense?: { data: Expense };
  payment_method?: { data: PaymentMethod };
  advance?: { data: Advance };
}

export interface ReportCreate {
  user_id: number;
  external_id?: string;
  description?: string;
  payment_method_id?: number;
}

export interface ReportPay {
  payment_date: string;
  comment?: string;
}

export interface ReportApprove {
  approver: number;
  comment: string;
  expenses: Record<string, boolean>;
}

export interface ReportApproval {
  id: number;
  idFluxoEtapa: number;
  idDespesa: number;
  idUsuarioAprovador: number;
  dataAprovacao: string;
  aprovado: boolean;
  comentarioAprovacao: string;
  created_at: string;
  updated_at: string;
}

// Payment Methods
export interface PaymentMethod {
  id: number;
  name?: string;
  description?: string;
  reimbursable?: boolean;
  affects_advance?: boolean;
}

// Funções da API
export const vExpensesApi = {
  // ==================== TEAM MEMBERS ====================
  
  // Listar todos os membros da equipe
  getTeamMembers: async (params?: {
    include?: string;
    paginate?: boolean;
    page?: number;
    per_page?: number;
  }) => {
    const response = await api.get<ApiResponse<TeamMember[]>>('/v2/team-members', { params });
    return response.data;
  },

  // Obter membro por ID
  getTeamMemberById: async (id: number) => {
    const response = await api.get<ApiResponse<TeamMember>>(`/v2/team-members/${id}`);
    return response.data;
  },

  // Obter membro por email
  getTeamMemberByEmail: async (email: string) => {
    const response = await api.get<ApiResponse<TeamMember>>(`/v2/team-members/email/${email}`);
    return response.data;
  },

  // Listar parâmetros de membros
  getTeamMemberParameters: async () => {
    const response = await api.get<ApiResponse<TeamMemberParameter[]>>('/v2/team-members/parameters');
    return response.data;
  },

  // Atualizar membro
  updateTeamMember: async (id: number, data: TeamMemberUpdate) => {
    const response = await api.put<ApiResponse<TeamMember>>(`/v2/team-members/${id}`, data);
    return response.data;
  },

  // Criar membro
  createTeamMember: async (data: TeamMemberCreate) => {
    const response = await api.post<ApiResponse<TeamMember[]>>('/v2/team-members', data);
    return response.data;
  },

  // Anexar centro de custo ao membro
  attachCostCenterToMember: async (id: number, costCenters: Record<string, boolean>) => {
    const response = await api.post<ApiResponse<TeamMember[]>>(
      `/v2/team-members/${id}/attach-cost-center`,
      { cost_center_external_code: costCenters },
      { params: { include: 'costsCenters' } }
    );
    return response.data;
  },

  // Anexar projetos ao membro
  attachProjectsToMember: async (id: number, projects: Record<string, boolean>) => {
    const response = await api.post<ApiResponse<TeamMember>>(
      `/v2/team-members/${id}/attach-projects`,
      { project_external_code: projects },
      { params: { include: 'projects' } }
    );
    return response.data;
  },

  // ==================== COST CENTERS ====================
  
  // Listar todos os centros de custo
  getCostCenters: async (params?: {
    paginate?: boolean;
    per_page?: number;
    page?: number;
  }) => {
    const response = await api.get<ApiResponse<CostCenter[]>>('/v2/costs-centers', { params });
    return response.data;
  },

  // Obter centro de custo por ID
  getCostCenterById: async (id: number) => {
    const response = await api.get<ApiResponse<CostCenter>>(`/v2/costs-centers/${id}`);
    return response.data;
  },

  // Atualizar centro de custo
  updateCostCenter: async (id: number, data: CostCenterUpdate) => {
    const response = await api.put<ApiResponse<CostCenter>>(`/v2/costs-centers/${id}`, data);
    return response.data;
  },

  // Criar centro de custo
  createCostCenter: async (data: CostCenterCreate) => {
    const response = await api.post<ApiResponse<CostCenter>>('/v2/costs-centers', data);
    return response.data;
  },

  // Remover centro de custo
  deleteCostCenter: async (id: number) => {
    const response = await api.delete<ApiResponse<null>>(`/v2/costs-centers/${id}`);
    return response.data;
  },

  // ==================== PROJECTS ====================
  
  // Listar todos os projetos
  getProjects: async (params?: {
    paginate?: boolean;
    per_page?: number;
    page?: number;
  }) => {
    const response = await api.get<ApiResponse<Project[]>>('/v2/projects', { params });
    return response.data;
  },

  // Obter projeto por ID
  getProjectById: async (id: number) => {
    const response = await api.get<ApiResponse<Project>>(`/v2/projects/${id}`);
    return response.data;
  },

  // Atualizar projeto
  updateProject: async (id: number, data: ProjectUpdate) => {
    const response = await api.put<ApiResponse<Project>>(`/v2/projects/${id}`, data);
    return response.data;
  },

  // Criar projeto
  createProject: async (data: ProjectCreate) => {
    const response = await api.post<ApiResponse<Project[]>>('/v2/projects', data);
    return response.data;
  },

  // Remover projeto
  deleteProject: async (id: number) => {
    const response = await api.delete<ApiResponse<null>>(`/v2/projects/${id}`);
    return response.data;
  },

  // ==================== APPROVAL FLOWS ====================
  
  // Listar todos os fluxos de aprovação
  getApprovalFlows: async () => {
    const response = await api.get<ApiResponse<ApprovalFlow[]>>('/v2/approval-flows');
    return response.data;
  },

  // Obter fluxo de aprovação por ID
  getApprovalFlowById: async (id: number) => {
    const response = await api.get<ApiResponse<ApprovalFlow[]>>(`/v2/approval-flows/${id}`);
    return response.data;
  },

  // Atualizar fluxo de aprovação
  updateApprovalFlow: async (id: number, data: ApprovalFlowUpdate) => {
    const response = await api.put<ApiResponse<ApprovalFlow[]>>(`/v2/approval-flows/${id}`, data);
    return response.data;
  },

  // Criar fluxo de aprovação
  createApprovalFlow: async (data: ApprovalFlowCreate) => {
    const response = await api.post<ApiResponse<ApprovalFlow[]>>('/v2/approval-flows', data);
    return response.data;
  },

  // Anexar centros de custo ao fluxo de aprovação
  attachCostCentersToApprovalFlow: async (id: number, costCenterIds: number[]) => {
    const response = await api.post<ApiResponse<any>>(
      `/v2/approval-flows/${id}/attach-cost-centers`,
      { cost_centers_ids: costCenterIds }
    );
    return response.data;
  },

  // Remover fluxo de aprovação
  deleteApprovalFlow: async (id: number) => {
    const response = await api.delete<ApiResponse<null>>(`/v2/approval-flows/${id}`);
    return response.data;
  },

  // ==================== EXPENSES ====================
  
  // Listar todas as despesas
  getExpenses: async (params?: {
    include?: string;
    search?: string;
    searchFields?: string;
    searchJoin?: string;
  }) => {
    // O endpoint expenses exige parâmetros search e searchFields obrigatoriamente
    const defaultParams = {
      search: 'date:2020-01-01,2030-12-31',
      searchFields: 'date:between',
      ...params,
    };
    const response = await api.get<ApiResponse<Expense[]>>('/v2/expenses', { params: defaultParams });
    return response.data;
  },

  // Obter despesa por ID
  getExpenseById: async (id: number, include?: string) => {
    const queryParams = include ? { include } : {};
    const response = await api.get<ApiResponse<Expense>>(`/v2/expenses/${id}`, { params: queryParams });
    return response.data;
  },

  // Atualizar despesa
  updateExpense: async (id: number, data: ExpenseUpdate) => {
    const response = await api.put<ApiResponse<Expense>>(
      `/v2/expenses/${id}`,
      data,
      { params: { include: 'apportionment' } }
    );
    return response.data;
  },

  // Criar despesa
  createExpense: async (data: ExpenseCreate) => {
    const response = await api.post<ApiResponse<Expense[]>>(
      '/v2/expenses',
      data,
      { params: { include: 'apportionment' } }
    );
    return response.data;
  },

  // Remover despesa
  deleteExpense: async (id: number) => {
    const response = await api.delete<ApiResponse<null>>(`/v2/expenses/${id}`);
    return response.data;
  },

  // ==================== EXPENSE TYPES ====================
  
  // Listar todos os tipos de despesas
  getExpenseTypes: async () => {
    const response = await api.get<ApiResponse<ExpenseType[]>>('/v2/expenses-type');
    return response.data;
  },

  // Obter tipo de despesa por ID
  getExpenseTypeById: async (id: number) => {
    const response = await api.get<ApiResponse<ExpenseType[]>>(`/v2/expenses-type/${id}`);
    return response.data;
  },

  // Atualizar tipo de despesa
  updateExpenseType: async (id: number, data: ExpenseTypeUpdate) => {
    const response = await api.put<ApiResponse<ExpenseType>>(`/v2/expenses-type/${id}`, data);
    return response.data;
  },

  // Criar tipo de despesa
  createExpenseType: async (data: ExpenseTypeCreate) => {
    const response = await api.post<ApiResponse<ExpenseType>>('/v2/expenses-type', data);
    return response.data;
  },

  // Remover tipo de despesa
  deleteExpenseType: async (id: number) => {
    const response = await api.delete<ApiResponse<null>>(`/v2/expenses-type/${id}`);
    return response.data;
  },

  // ==================== CURRENCIES ====================
  
  // Listar todas as moedas
  getCurrencies: async () => {
    const response = await api.get<ApiResponse<Currency[]>>('/v2/currencies');
    return response.data;
  },

  // ==================== ADVANCES ====================
  
  // Criar adiantamento
  createAdvance: async (data: AdvanceCreate) => {
    const response = await api.post<ApiResponse<Advance>>('/v2/advances', data);
    return response.data;
  },

  // ==================== REPORTS ====================
  
  // Listar todos os relatórios
  getReports: async (params?: {
    include?: string;
  }) => {
    const response = await api.get<ApiResponse<Report[]>>('/v2/reports', { params });
    return response.data;
  },

  // Obter relatório por ID
  getReportById: async (id: number, include?: string) => {
    const queryParams = include ? { include } : {};
    const response = await api.get<ApiResponse<Report[]>>(`/v2/reports/${id}`, { params: queryParams });
    return response.data;
  },

  // Listar relatórios por status
  getReportsByStatus: async (
    status: 'ABERTO' | 'APROVADO' | 'REPROVADO' | 'REABERTO' | 'PAGO' | 'ENVIADO',
    params?: {
      include?: string;
      search?: string;
      searchFields?: string;
      searchJoin?: string;
    }
  ) => {
    const response = await api.get<ApiResponse<Report[]>>(`/v2/reports/status/${status}`, { params });
    return response.data;
  },

  // Pagar relatório
  payReport: async (id: number, data: ReportPay) => {
    const response = await api.put<ApiResponse<Report>>(`/v2/reports/${id}/pay`, data);
    return response.data;
  },

  // Criar relatório
  createReport: async (data: ReportCreate) => {
    const response = await api.post<ApiResponse<Report>>('/v2/reports', data);
    return response.data;
  },

  // Aprovar relatório
  approveReport: async (id: number, data: ReportApprove) => {
    const response = await api.post<ApiResponse<ReportApproval[]>>(`/v2/reports/${id}/approve`, data);
    return response.data;
  },
};

export default api;
