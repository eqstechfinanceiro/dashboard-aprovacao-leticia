// Seed do changelog — espelha as entregas relevantes do dashboard. Inserido
// com ON CONFLICT DO NOTHING: edições feitas no banco sobrevivem a deploys,
// e versões novas entram automaticamente quando o seed cresce.

export interface ChangelogSeedItem {
  tag: 'feat' | 'improve' | 'fix';
  text: string;
}

export interface ChangelogSeedEntry {
  version: string;
  seq: number;
  date: string; // YYYY-MM-DD
  title: string;
  items: ChangelogSeedItem[];
}

// seq menor = mais novo primeiro na listagem.
export const CHANGELOG_SEED: ChangelogSeedEntry[] = [
  {
    version: '26.4.0',
    seq: 100,
    date: '2026-08-19',
    title: 'Ciclo completo de tratamento fiscal',
    items: [
      { tag: 'feat', text: 'Borderôs — página do contas a pagar com a fila de títulos a remover do borderô' },
      { tag: 'feat', text: 'Verificação automática de borderô (SEA/SE2) em batch, com badge "Em borderô" nas notas' },
      { tag: 'feat', text: 'Monitor de canceladas — detecta re-lançamento no TOTVS e re-confere contra o XML' },
      { tag: 'feat', text: 'Novidades (esta página) e Histórico de atividades' },
      { tag: 'improve', text: 'Ações completas nas views de mercadoria/serviço — paridade com o histórico' },
      { tag: 'fix', text: 'Borderô de notas de serviço agora usa o código do fornecedor (antes sempre "fora de borderô")' },
    ],
  },
  {
    version: '26.3.7',
    seq: 110,
    date: '2026-08-18',
    title: 'Captura de XML via Protheus',
    items: [
      { tag: 'feat', text: 'Nova fonte de XML: capturarXML do Protheus (botão "Criar Processo" do portal EQS)' },
      { tag: 'improve', text: 'Cadeia de fontes: cache → Z01 → SDS → captura Protheus → SIEG → MeuDanfe' },
    ],
  },
  {
    version: '26.3.6',
    seq: 120,
    date: '2026-08-12',
    title: 'Fila fiscal e borderô por nota',
    items: [
      { tag: 'feat', text: 'Consulta de borderô (SEA/SE2) na nota expandida — número, data, banco e baixa' },
      { tag: 'feat', text: 'Deep link pro processo de pagamento no portal EQS' },
      { tag: 'improve', text: 'Docs do portal EQS anexados em lote às notas de serviço' },
    ],
  },
];
