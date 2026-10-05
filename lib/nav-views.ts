// "Ver como" — filtro de setor aplicado ao menu lateral.
// O admin/gestor escolhe um setor no header e o menu passa a mostrar só o que
// aquele setor usa. O filtro só encolhe, nunca expande (interseção com as
// permissões reais do usuário). Itens `always` (Suporte) ficam em toda visão.

export const SECTOR_VIEWS = [
  { id: 'all', label: 'Todos os setores' },
  { id: 'gestao-caixa', label: 'Gestão de Caixa' },
  { id: 'contas-pagar', label: 'Contas a Pagar' },
  { id: 'entrada-notas', label: 'Entrada de Notas' },
  { id: 'fiscal', label: 'Setor Fiscal' },
] as const;

export type SectorView = (typeof SECTOR_VIEWS)[number]['id'];

// Módulos que cada setor enxerga (mapeamento definido com o time).
const SECTOR_MODULES: Record<Exclude<SectorView, 'all'>, string[]> = {
  // Gerencial: tudo menos Impacto Financeiro e Fiscal.
  // Operacional: tudo menos Automação Comprovantes, Ferramentas Itaú, Cartórios.
  // Fechamento: tudo. Sistema: tudo menos Configurações.
  'gestao-caixa': [
    'dashboard',
    'analytics',
    'gestao-caixa',
    'pendencias',
    'aprovacoes',
    'pending-approvals',
    'aprovacao-dinamica',
    'quinzena-dinamica',
    'controle',
    'fechamento',
    'sync-health',
    'audit-log',
  ],
  'contas-pagar': [
    'pendencias',
    'automacao-comprovantes',
    'ferramentas-itau',
    'cartorios',
  ],
  // Gerencial menos Fiscal e Impacto Financeiro.
  'entrada-notas': [
    'dashboard',
    'analytics',
    'gestao-caixa',
    'pendencias',
  ],
  fiscal: ['fiscal'],
};

export const VIEW_STORAGE_KEY = 'aery:view';
export const VIEW_EVENT = 'aery:view-changed';

// Decide se um item do menu aparece na visão escolhida.
export function itemInView(view: SectorView, moduleId: string, always?: boolean): boolean {
  if (view === 'all' || always) return true;
  return SECTOR_MODULES[view].includes(moduleId);
}

export function readStoredView(): SectorView {
  if (typeof window === 'undefined') return 'all';
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return (SECTOR_VIEWS as readonly { id: string }[]).some((s) => s.id === v)
    ? (v as SectorView)
    : 'all';
}
