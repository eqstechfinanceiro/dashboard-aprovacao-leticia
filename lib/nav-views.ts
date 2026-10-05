// "Ver como" — filtro de setor aplicado ao menu lateral.
// O admin/gestor escolhe um setor no header e o menu passa a mostrar só o que
// aquele setor usa. A categoria "Análise Gerencial" e itens `always` (Suporte)
// permanecem visíveis em todas as visões — o filtro só encolhe, nunca expande
// (interseção com as permissões reais do usuário).

export const SECTOR_VIEWS = [
  { id: 'all', label: 'Todos os setores' },
  { id: 'gestao-caixa', label: 'Gestão de Caixa' },
  { id: 'contas-pagar', label: 'Contas a Pagar' },
  { id: 'entrada-notas', label: 'Entrada de Notas' },
  { id: 'fiscal', label: 'Setor Fiscal' },
] as const;

export type SectorView = (typeof SECTOR_VIEWS)[number]['id'];

// Categoria que fica sempre visível (sujeita à permissão por módulo).
export const GERENCIAL_CATEGORY = 'Análise Gerencial';

// Módulos fora de "Análise Gerencial" que cada setor enxerga.
const SECTOR_MODULES: Record<Exclude<SectorView, 'all'>, string[]> = {
  'gestao-caixa': [
    'aprovacoes',
    'pending-approvals',
    'aprovacao-dinamica',
    'automacao-comprovantes',
    'ferramentas-itau',
    'quinzena-dinamica',
    'controle',
    'fechamento',
  ],
  'contas-pagar': [
    'automacao-comprovantes',
    'quinzena-dinamica',
    'controle',
    'fechamento',
    'cartorios',
  ],
  'entrada-notas': [
    'quinzena-dinamica',
    'fechamento',
  ],
  fiscal: [],
};

export const VIEW_STORAGE_KEY = 'aery:view';
export const VIEW_EVENT = 'aery:view-changed';

// Decide se um item do menu aparece na visão escolhida.
// `category` é o label do grupo no sidebar.
export function itemInView(view: SectorView, category: string, moduleId: string, always?: boolean): boolean {
  if (view === 'all' || always || category === GERENCIAL_CATEGORY) return true;
  return SECTOR_MODULES[view].includes(moduleId);
}

export function readStoredView(): SectorView {
  if (typeof window === 'undefined') return 'all';
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return (SECTOR_VIEWS as readonly { id: string }[]).some((s) => s.id === v)
    ? (v as SectorView)
    : 'all';
}
