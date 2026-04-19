/**
 * Types that describe the shape of the VExpenses public API v2 responses.
 * Derived from real responses captured from the EQS tenant during the
 * documentation phase (see docs/API-VExpenses.md). Fields that may be absent
 * on some endpoints are marked optional.
 */

export type Envelope<T> = {
  data: T;
  meta?: {
    currentPage?: number;
    lastPage?: number;
    total?: number;
    perPage?: number;
    [k: string]: unknown;
  };
};

export type ReportStatus =
  | "ABERTO"
  | "ENVIADO"
  | "APROVADO"
  | "REPROVADO"
  | "REABERTO"
  | "PAGO";

export interface Company {
  id: number;
  name: string;
  document?: string | null;
}

export interface TeamMember {
  id: number;
  name: string;
  email?: string | null;
  role?: "admin" | "user" | string;
  active?: boolean;
  companyId?: number;
  departmentName?: string | null;
  costsCenterId?: number | null;
  costs_center_id?: number | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface CostsCenter {
  id: number;
  name: string;
  code?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Project {
  id: number;
  name: string;
  active?: boolean;
  costs_center_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalFlow {
  id: number;
  name: string;
  active?: boolean;
  steps?: ApprovalStep[];
  created_at?: string;
}

export interface ApprovalStep {
  id: number;
  order: number;
  logic?: "AND" | "OR";
  entrance_value?: number | null;
  approvers?: ApprovalApprover[];
}

export interface ApprovalApprover {
  id: number;
  team_member_id: number;
  approved_at?: string | null;
  approved?: boolean | null;
}

export interface PaymentMethod {
  id: number;
  name: string;
  affects_advance?: boolean;
  reimbursable?: boolean;
  active?: boolean;
}

export interface ExpenseType {
  id: number;
  name: string;
  code?: string | null;
  active?: boolean;
}

export interface Currency {
  id: number;
  code: string;
  symbol?: string;
  rate?: number;
}

export interface Attachment {
  id: number;
  url?: string;
  reicept_url?: string;
  receipt_url?: string;
  file_name?: string;
  mime_type?: string;
}

export interface Expense {
  id: number;
  expense_id?: number;
  report_id?: number;
  team_member_id?: number;
  value: number | string;
  currency_id?: number;
  date?: string;
  description?: string | null;
  expense_type?: ExpenseType | null;
  expense_type_id?: number;
  payment_method?: PaymentMethod | null;
  payment_method_id?: number;
  costs_center?: CostsCenter | null;
  costs_center_id?: number;
  project?: Project | null;
  project_id?: number | null;
  reicept_url?: string | null;
  receipt_url?: string | null;
  gps?: { latitude?: number; longitude?: number } | null;
  fueling?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface HistoryEvent {
  id: number;
  action: string;
  created_at: string;
  team_member?: TeamMember | null;
  team_member_id?: number;
  description?: string | null;
}

export interface Advance {
  id: number;
  team_member_id: number;
  value: number | string;
  currency_id?: number;
  description?: string | null;
  advance_report_id?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface Report {
  id: number;
  description: string | null;
  status: ReportStatus;
  team_member_id: number;
  team_member?: TeamMember | null;
  costs_center?: CostsCenter | null;
  costs_center_id?: number | null;
  project?: Project | null;
  project_id?: number | null;
  total?: number | string;
  total_reimbursable?: number | string;
  total_advance?: number | string;
  approval_flow?: ApprovalFlow | null;
  approval_flow_id?: number | null;
  approval_steps?: ApprovalStep[];
  payment_date?: string | null;
  sent_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  refunded_at?: string | null;
  expenses?: Expense[];
  history?: HistoryEvent[];
  advance?: Advance[] | Advance | null;
  created_at: string;
  updated_at: string;
  [k: string]: unknown;
}

export type ReportInclude =
  | "teamMember"
  | "costsCenter"
  | "project"
  | "expenses"
  | "expenses.expenseType"
  | "expenses.paymentMethod"
  | "expenses.costsCenter"
  | "expenses.project"
  | "expenses.gps"
  | "expenses.fueling"
  | "approvalFlow"
  | "approvalFlow.approvalSteps"
  | "approvalFlow.approvalSteps.approvers"
  | "history"
  | "history.teamMember"
  | "advance";
