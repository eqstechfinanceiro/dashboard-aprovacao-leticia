import {
  LayoutDashboard,
  CheckSquare2,
  FileText,
  Receipt,
  Wallet,
  Users,
  Building2,
  Briefcase,
  BarChart3,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  description?: string;
  badge?: string;
}

export const NAV: NavItem[] = [
  {
    href: "/",
    label: "Visão geral",
    icon: LayoutDashboard,
    shortcut: "g h",
    description: "KPIs e gráficos do mês",
  },
  {
    href: "/aprovacoes",
    label: "Aprovações",
    icon: CheckSquare2,
    shortcut: "g a",
    description: "Fila de relatórios para aprovar",
  },
  {
    href: "/relatorios",
    label: "Relatórios",
    icon: FileText,
    shortcut: "g r",
    description: "Todos os relatórios de despesa",
  },
  {
    href: "/despesas",
    label: "Despesas",
    icon: Receipt,
    shortcut: "g d",
    description: "Itens individuais de despesa",
  },
  {
    href: "/caixa",
    label: "Caixa",
    icon: Wallet,
    shortcut: "g c",
    description: "Saldo dos colaboradores",
  },
  {
    href: "/colaboradores",
    label: "Colaboradores",
    icon: Users,
    shortcut: "g u",
  },
  {
    href: "/centros-custo",
    label: "Centros de custo",
    icon: Building2,
    shortcut: "g k",
  },
  {
    href: "/projetos",
    label: "Projetos",
    icon: Briefcase,
    shortcut: "g p",
  },
  {
    href: "/analises",
    label: "Análises",
    icon: BarChart3,
    shortcut: "g n",
    description: "Tempo de aprovação, SLA, ABC",
  },
  {
    href: "/ia",
    label: "IA Consultora",
    icon: Sparkles,
    shortcut: "g i",
    description: "Regras e chat contextual",
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    shortcut: "g s",
  },
];
