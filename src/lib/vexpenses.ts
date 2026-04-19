import "server-only";
import type {
  Advance,
  ApprovalFlow,
  CostsCenter,
  Currency,
  Envelope,
  Expense,
  ExpenseType,
  PaymentMethod,
  Project,
  Report,
  ReportInclude,
  TeamMember,
} from "@/types/vexpenses";

/**
 * Server-only VExpenses client. Reads the token from process.env.VEXPENSES_TOKEN.
 *
 * Key quirks captured in docs/API-VExpenses.md:
 *   - Authorization header carries the RAW token (no "Bearer" prefix).
 *   - Rate limit 100 req/min; we default to cache revalidation every 60s.
 *   - Envelope is { data, meta? }; always unwrap before returning.
 *   - GET /v2/expenses requires `search` + `searchFields` to work.
 *   - GET /v2/advances does NOT exist; advances must be discovered through
 *     `GET /v2/reports?include=advance` and/or our local DB (table `advances`).
 */

const BASE_URL = "https://api.vexpenses.com";
const DEFAULT_REVALIDATE = 60;

type Primitive = string | number | boolean | null | undefined;
type Params = Record<string, Primitive | Primitive[]>;

function buildQuery(params: Params | undefined): string {
  if (!params) return "";
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      const filtered = value.filter((v) => v != null);
      if (filtered.length === 0) continue;
      entries.push([key, filtered.join(",")]);
    } else {
      entries.push([key, String(value)]);
    }
  }
  if (entries.length === 0) return "";
  const qs = new URLSearchParams(entries).toString();
  return `?${qs}`;
}

function getToken(): string {
  const token = process.env.VEXPENSES_TOKEN;
  if (!token) {
    throw new Error(
      "VEXPENSES_TOKEN is not set. Add it to .env.local (local) or to the project env vars (Vercel).",
    );
  }
  return token;
}

export interface RequestOptions {
  revalidate?: number | false;
  tags?: string[];
  signal?: AbortSignal;
}

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [400, 1200, 2500];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function vexRequest<T>(
  path: string,
  params?: Params,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${BASE_URL}${path}${buildQuery(params)}`;
  const token = getToken();

  const next: { revalidate?: number | false; tags?: string[] } = {};
  if (options.revalidate === false) next.revalidate = false;
  else next.revalidate = options.revalidate ?? DEFAULT_REVALIDATE;
  if (options.tags) next.tags = options.tags;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: token,
          Accept: "application/json",
        },
        next,
        signal: options.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const retriable =
          response.status === 429 ||
          (response.status >= 500 && response.status < 600);
        if (retriable && attempt < MAX_RETRIES) {
          lastError = new VExpensesError(
            response.status,
            `VExpenses ${response.status} ${response.statusText} ${path}: ${text}`,
          );
          await sleep(RETRY_BACKOFF_MS[attempt] ?? 2500);
          continue;
        }
        throw new VExpensesError(
          response.status,
          `VExpenses ${response.status} ${response.statusText} ${path}: ${text}`,
        );
      }

      const json = (await response.json()) as Envelope<T> | T;
      if (json && typeof json === "object" && "data" in (json as object)) {
        return (json as Envelope<T>).data;
      }
      return json as T;
    } catch (e) {
      const isNetworkError =
        e instanceof TypeError || (e as { code?: string })?.code === "UND_ERR_SOCKET";
      if (isNetworkError && attempt < MAX_RETRIES) {
        lastError = e;
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 2500);
        continue;
      }
      throw e;
    }
  }
  throw lastError ?? new Error(`VExpenses request failed: ${path}`);
}

export class VExpensesError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "VExpensesError";
  }
}

export interface ReportFilters {
  status?: string | string[];
  teamMemberId?: number | number[];
  costsCenterId?: number | number[];
  projectId?: number | number[];
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  perPage?: number;
  include?: ReportInclude[];
}

function reportParams(filters?: ReportFilters): Params {
  const params: Params = {};
  if (!filters) return params;
  const {
    status,
    teamMemberId,
    costsCenterId,
    projectId,
    startDate,
    endDate,
    search,
    page,
    perPage,
    include,
  } = filters;
  if (status) params["filter[status]"] = status as Primitive | Primitive[];
  if (teamMemberId)
    params["filter[teamMemberId]"] = teamMemberId as Primitive | Primitive[];
  if (costsCenterId)
    params["filter[costsCenterId]"] = costsCenterId as Primitive | Primitive[];
  if (projectId) params["filter[projectId]"] = projectId as Primitive | Primitive[];
  if (startDate) params["filter[startDate]"] = startDate;
  if (endDate) params["filter[endDate]"] = endDate;
  if (search) params.search = search;
  if (page) params.page = page;
  if (perPage) params.perPage = perPage;
  if (include && include.length > 0) params.include = include.join(",");
  return params;
}

// ---------- Team members ----------
export async function getTeamMembers(
  options?: RequestOptions,
): Promise<TeamMember[]> {
  return vexRequest<TeamMember[]>("/v2/team-members", undefined, {
    tags: ["team-members"],
    ...options,
  });
}

export async function getTeamMember(
  id: number,
  options?: RequestOptions,
): Promise<TeamMember> {
  return vexRequest<TeamMember>(`/v2/team-members/${id}`, undefined, {
    tags: [`team-member:${id}`],
    ...options,
  });
}

// ---------- Costs centers ----------
export async function getCostsCenters(
  options?: RequestOptions,
): Promise<CostsCenter[]> {
  return vexRequest<CostsCenter[]>("/v2/costs-centers", undefined, {
    tags: ["costs-centers"],
    ...options,
  });
}

// ---------- Projects ----------
export async function getProjects(options?: RequestOptions): Promise<Project[]> {
  return vexRequest<Project[]>("/v2/projects", undefined, {
    tags: ["projects"],
    ...options,
  });
}

// ---------- Approval flows ----------
export async function getApprovalFlows(
  options?: RequestOptions,
): Promise<ApprovalFlow[]> {
  return vexRequest<ApprovalFlow[]>("/v2/approval-flows", undefined, {
    tags: ["approval-flows"],
    ...options,
  });
}

// ---------- Currencies ----------
export async function getCurrencies(
  options?: RequestOptions,
): Promise<Currency[]> {
  return vexRequest<Currency[]>("/v2/currencies", undefined, {
    tags: ["currencies"],
    revalidate: 3600,
    ...options,
  });
}

// ---------- Expense types / payment methods ----------
export async function getExpenseTypes(
  options?: RequestOptions,
): Promise<ExpenseType[]> {
  return vexRequest<ExpenseType[]>("/v2/expenses-type", undefined, {
    tags: ["expense-types"],
    ...options,
  });
}

// ---------- Reports ----------
export async function getReports(
  filters?: ReportFilters,
  options?: RequestOptions,
): Promise<Report[]> {
  return vexRequest<Report[]>("/v2/reports", reportParams(filters), {
    tags: ["reports"],
    ...options,
  });
}

export async function getReport(
  id: number,
  include?: ReportInclude[],
  options?: RequestOptions,
): Promise<Report> {
  const params: Params = {};
  if (include && include.length > 0) params.include = include.join(",");
  return vexRequest<Report>(`/v2/reports/${id}`, params, {
    tags: [`report:${id}`],
    ...options,
  });
}

// ---------- Expenses ----------
export interface ExpenseFilters {
  search?: string;
  searchFields?: string;
  page?: number;
  perPage?: number;
}

export async function getExpenses(
  filters: ExpenseFilters,
  options?: RequestOptions,
): Promise<Expense[]> {
  const params: Params = {
    search: filters.search,
    searchFields: filters.searchFields ?? "description:like",
    page: filters.page,
    perPage: filters.perPage,
  };
  return vexRequest<Expense[]>("/v2/expenses", params, {
    tags: ["expenses"],
    ...options,
  });
}

// ---------- Advances (write-only in the public API) ----------
export interface CreateAdvancePayload {
  team_member_id: number;
  value: number;
  currency_id?: number;
  description?: string;
}

/**
 * Creates an advance in VExpenses. The public API exposes no GET endpoint for
 * advances, so every successful call is mirrored into the local `advances`
 * table (see db/schema.ts) to preserve history.
 */
export async function createAdvance(
  payload: CreateAdvancePayload,
): Promise<Advance> {
  const token = getToken();
  const response = await fetch(`${BASE_URL}/v2/advances`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new VExpensesError(
      response.status,
      `POST /v2/advances failed: ${response.status} ${text}`,
    );
  }
  const json = (await response.json()) as Envelope<Advance> | Advance;
  return (json as Envelope<Advance>).data ?? (json as Advance);
}

// ---------- Approval / payment write operations ----------
export async function approveReport(id: number): Promise<void> {
  await writeCall(`/v2/reports/${id}/approve`, "POST");
}

export async function rejectReport(
  id: number,
  reason?: string,
): Promise<void> {
  await writeCall(`/v2/reports/${id}/reject`, "POST", { reason });
}

export async function reopenReport(id: number): Promise<void> {
  await writeCall(`/v2/reports/${id}/reopen`, "POST");
}

export async function payReport(
  id: number,
  payment_date?: string,
): Promise<void> {
  await writeCall(`/v2/reports/${id}/pay`, "PUT", { payment_date });
}

async function writeCall(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<unknown> {
  if (process.env.ENABLE_WRITES !== "true") {
    throw new Error(
      `Writes are disabled. Set ENABLE_WRITES=true to allow ${method} ${path}.`,
    );
  }
  const token = getToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new VExpensesError(
      response.status,
      `${method} ${path} failed: ${response.status} ${text}`,
    );
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

export { PaymentMethod };
