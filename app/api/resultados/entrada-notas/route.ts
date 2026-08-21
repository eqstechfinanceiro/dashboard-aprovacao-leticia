import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TOTVS_BASE_URL = 'https://totvs.eqsengenharia.com.br:8880';
const TOTVS_TOKEN_URL = TOTVS_BASE_URL + '/app-root/servicos/api/oauth2/v1/token';
const TOTVS_QUERY_URL = TOTVS_BASE_URL + '/app-root/servicos/api/framework/v1/genericQuery';
const TOTVS_WEBAPP_URL = TOTVS_BASE_URL + '/webapp/?E=servicos&P=sigamdi';

const TOTVS_USER = process.env.TOTVS_USER || 'bot.contabil';
const TOTVS_PASSWORD = process.env.TOTVS_PASSWORD || 'EQSeng4292@';

const SF1_SA2_FIELDS = (
  'F1_FILIAL,F1_DOC,F1_SERIE,F1_FORNECE,F1_LOJA,F1_EMISSAO,F1_VALBRUT,' +
  'F1_DTDIGIT,F1_DTLANC,F1_ESPECIE,F1_HORA,F1_COND,F1_TIPO,' +
  'F1_DESCONT,F1_IRRF,F1_INSS,F1_ISS,F1_STATUS,F1_USERLGI,' +
  'F1_TIPODOC,F1_VALPIS,F1_VALCSLL,F1_CHVNFE,F1_NATUREZ,' +
  'F1_VALICMS,F1_VALIPI,F1_BRICMS,F1_BRIPI,F1_ICMST,' +
  'A2_NOME,A2_CGC'
);

const USERLGI_MAP: Record<string, string> = {
  '0#  6@= 20C 704': 'ariane.oliveira',
  '1#  8@= 50B 90:': 'bot.contabil',
  '1#  8@= 50B 90;': 'bot.contabil',
  '1#  8@= 50C 904': 'bot.contabil',
  '1#  8@= 70B 00:': 'ana.anjos',
  '1#  8@= 70B 00;': 'ana.anjos',
  '1#  8@= 70C 004': 'ana.anjos',
  '2#  0@= 20C 104': 'mateus.miranda',
  '2#  2@= 10B 40:': 'marcos.machado',
  '2#  2@= 10C 404': 'marcos.machado',
  '2#  3@= 60B 20:': 'stefani.alves',
  '2#  4@= 70B 50:': 'beatryz.santos',
  '2#  4@= 70C 504': 'beatryz.santos',
};

function decodeUserlgi(userlgi: string): string {
  if (!userlgi) return '';
  return USERLGI_MAP[userlgi.trim()] || userlgi.trim();
}

function fmtDateProtheus(dateStr: string): string {
  const [dd, mm, yyyy] = dateStr.split('/');
  return `${yyyy}${mm}${dd}`;
}

function fmtDateBr(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return '';
  try {
    if (dateStr.includes('-')) {
      const dt = new Date(dateStr.slice(0, 10));
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
      return `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

const DEFAULT_TENANTS = [
  { id: '02,02', name: 'EQS', filial: '02' },
  { id: '11,01', name: 'BRATEC', filial: '01' },
];

async function totvsGetCookie(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(TOTVS_WEBAPP_URL, {
        method: 'GET',
        // @ts-ignore - custom Node.js agent for self-signed cert
        agent: undefined,
      });
      const cookieHeader = res.headers.get('set-cookie') || '';
      for (const part of cookieHeader.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith('TOTVS_PROXY_SH_001=')) {
          return trimmed;
        }
      }
      return '';
    } catch (e) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw e;
      }
    }
  }
  return '';
}

async function totvsLogin(user: string, password: string, cookie: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password',
    username: user,
    password: password,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(TOTVS_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Cookie': cookie,
        },
        body: body.toString(),
      });
      const data = await res.json();
      return data.access_token || '';
    } catch (e) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw e;
      }
    }
  }
  return '';
}

async function totvsQuery(
  token: string,
  cookie: string,
  tables: string,
  fields: string,
  where: string,
  page: number = 1,
  pageSize: number = 5000,
  tenantId?: string
): Promise<any> {
  const params = new URLSearchParams({
    tables,
    fields,
    where,
    page: String(page),
    pageSize: String(pageSize),
  });
  const url = `${TOTVS_QUERY_URL}?${params.toString()}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Cookie': cookie,
        'Accept': 'application/json',
      };
      if (tenantId) headers['tenantId'] = tenantId;

      const res = await fetch(url, { method: 'GET', headers });
      const data = await res.json();
      return data;
    } catch (e) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw e;
      }
    }
  }
  throw new Error('TOTVS query failed after 3 retries');
}

async function fetchNfHeaders(
  token: string,
  cookie: string,
  dateFrom: string,
  dateTo: string,
  especie: string | null,
  tenantId?: string
): Promise<any[]> {
  const dateFromP = fmtDateProtheus(dateFrom);
  const dateToP = fmtDateProtheus(dateTo);

  let where = `SF1.F1_DTDIGIT>='${dateFromP}' AND SF1.F1_DTDIGIT<='${dateToP}'`;
  if (especie) {
    if (especie.includes(',')) {
      const espList = especie.split(',').map(e => `'${e.trim()}'`).join(',');
      where += ` AND SF1.F1_ESPECIE IN (${espList})`;
    } else {
      where += ` AND SF1.F1_ESPECIE='${especie}'`;
    }
  }
  where += ` AND SF1.D_E_L_E_T_=' ' AND SA2.D_E_L_E_T_=' ' AND SF1.F1_FORNECE=SA2.A2_COD AND SF1.F1_LOJA=SA2.A2_LOJA`;

  const allItems: any[] = [];
  let page = 1;
  while (true) {
    const data = await totvsQuery(token, cookie, 'SF1,SA2', SF1_SA2_FIELDS, where, page, 5000, tenantId);
    const items = data.items || [];
    allItems.push(...items);
    if (data.hasNext) {
      page++;
    } else {
      break;
    }
  }
  return allItems;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from') || '';
    const dateTo = searchParams.get('date_to') || '';
    const especie = searchParams.get('especie') || null;

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'date_from and date_to are required (dd/MM/yyyy)' },
        { status: 400 }
      );
    }

    // Authenticate
    const cookie = await totvsGetCookie();
    if (!cookie) {
      return NextResponse.json({ error: 'Failed to get TOTVS cookie' }, { status: 502 });
    }

    const token = await totvsLogin(TOTVS_USER, TOTVS_PASSWORD, cookie);
    if (!token) {
      return NextResponse.json({ error: 'Failed to authenticate with TOTVS' }, { status: 502 });
    }

    // Fetch NF headers from all tenants
    const allHeaders: any[] = [];

    for (const tenant of DEFAULT_TENANTS) {
      try {
        const headers = await fetchNfHeaders(
          token, cookie, dateFrom, dateTo, especie, tenant.id
        );
        for (const h of headers) {
          h.f1_userlgi = decodeUserlgi(h.f1_userlgi || '');
          h._empresa = tenant.name;
          h._filial = tenant.filial;
          allHeaders.push(h);
        }
      } catch (e) {
        console.error(`[Entrada Notas] Error fetching tenant ${tenant.name}:`, e);
      }
    }

    // Build aggregations
    const byUser: Record<string, { count: number; totalValue: number }> = {};
    const byEspecie: Record<string, { count: number; totalValue: number }> = {};
    const byDay: Record<string, { count: number; totalValue: number }> = {};
    const byEmpresa: Record<string, { count: number; totalValue: number }> = {};

    let totalCount = 0;
    let totalValue = 0;

    const records = allHeaders.map((h) => {
      const user = h.f1_userlgi || 'desconhecido';
      const esp = (h.f1_especie || '').trim() || 'N/A';
      const valbrut = parseFloat(h.f1_valbrut) || 0;
      const dtDigit = fmtDateBr(h.f1_dtdigit || '');
      const empresa = h._empresa || 'N/A';

      totalCount++;
      totalValue += valbrut;

      if (!byUser[user]) byUser[user] = { count: 0, totalValue: 0 };
      byUser[user].count++;
      byUser[user].totalValue += valbrut;

      if (!byEspecie[esp]) byEspecie[esp] = { count: 0, totalValue: 0 };
      byEspecie[esp].count++;
      byEspecie[esp].totalValue += valbrut;

      if (!byDay[dtDigit]) byDay[dtDigit] = { count: 0, totalValue: 0 };
      byDay[dtDigit].count++;
      byDay[dtDigit].totalValue += valbrut;

      if (!byEmpresa[empresa]) byEmpresa[empresa] = { count: 0, totalValue: 0 };
      byEmpresa[empresa].count++;
      byEmpresa[empresa].totalValue += valbrut;

      return {
        doc: h.f1_doc || '',
        serie: h.f1_serie || '',
        fornecedor: h.a2_nome || '',
        cnpj: h.a2_cgc || '',
        especie: esp,
        emissao: fmtDateBr(h.f1_emissao || ''),
        dtDigitacao: dtDigit,
        valor: valbrut,
        usuario: user,
        empresa,
        filial: h.f1_filial || '',
        natureza: h.f1_naturez || '',
        chave: h.f1_chvnfe || '',
      };
    });

    // Sort records by date desc
    records.sort((a, b) => b.dtDigitacao.localeCompare(a.dtDigitacao));

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalCount,
          totalValue,
          uniqueUsers: Object.keys(byUser).length,
        },
        byUser: Object.entries(byUser)
          .map(([name, v]) => ({ name, count: v.count, totalValue: v.totalValue }))
          .sort((a, b) => b.count - a.count),
        byEspecie: Object.entries(byEspecie)
          .map(([name, v]) => ({ name, count: v.count, totalValue: v.totalValue }))
          .sort((a, b) => b.count - a.count),
        byDay: Object.entries(byDay)
          .map(([date, v]) => ({ date, count: v.count, totalValue: v.totalValue }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        byEmpresa: Object.entries(byEmpresa)
          .map(([name, v]) => ({ name, count: v.count, totalValue: v.totalValue }))
          .sort((a, b) => b.count - a.count),
        records,
      },
    });
  } catch (error) {
    console.error('[Entrada Notas API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
