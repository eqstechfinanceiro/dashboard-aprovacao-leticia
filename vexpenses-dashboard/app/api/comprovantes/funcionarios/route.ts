import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { searchFuncionarios, consultarPorCpf, listFuncionariosForExport } from '@/lib/comprovantes/funcionarios';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET ?q=<termo>&page=<n>  |  GET ?cpf=<cpf>
export async function GET(request: NextRequest) {
  try {
    const cpf = request.nextUrl.searchParams.get('cpf');
    if (cpf) {
      const f = await consultarPorCpf(cpf);
      return NextResponse.json({ funcionario: f });
    }
    const q = request.nextUrl.searchParams.get('q') || '';

    // Export Excel: todos os funcionários que batem com a busca (sem paginação)
    if (request.nextUrl.searchParams.get('format') === 'xlsx') {
      const rows = await listFuncionariosForExport(q);
      const HEADERS = ['Nome', 'CPF', 'Centro de Custo', 'Região', 'Filial', 'Empresa', 'Cargo', 'Função', 'Situação', 'Admissão', 'Demissão', 'Banco', 'Agência', 'Conta'];
      const data = rows.map((r: any) => ({
        'Nome': r.funcionario ?? '',
        'CPF': r.cpf ?? '',
        'Centro de Custo': r.cc ?? '',
        'Região': r.regiao_pcs ?? '',
        'Filial': r.filial ?? '',
        'Empresa': r.empresa ?? '',
        'Cargo': r.cargo ?? '',
        'Função': r.funcao ?? '',
        'Situação': r.situacao ?? '',
        'Admissão': r.admissao ?? '',
        'Demissão': r.demissao ?? '',
        'Banco': r.banco ?? '',
        'Agência': r.agencia ?? '',
        'Conta': r.conta ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
      if (!data.length) XLSX.utils.sheet_add_aoa(ws, [HEADERS], { origin: 'A1' });
      ws['!cols'] = [
        { wch: 42 }, { wch: 13 }, { wch: 15 }, { wch: 16 }, { wch: 10 },
        { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 22 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `funcionarios_${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1'));
    const limit = 50;
    const { rows, total } = await searchFuncionarios(q, limit, (page - 1) * limit);
    return NextResponse.json({ funcionarios: rows, total, page, pageSize: limit });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
