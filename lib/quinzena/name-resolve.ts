// Resolução nome→CPF entre o extrato do cartão (campo `usuario`) e o cadastro.
// Mesma lógica usada em quinzena-complete / quinzena-export / validate-calc.

/** Normalize name for matching: remove accents, uppercase, trim */
export function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s.toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple similarity ratio (bigram-based, good enough for short names) */
export function fuzzyMatchRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(a), bb = bigrams(b);
  let intersection = 0;
  for (const bg of ba) if (bb.has(bg)) intersection++;
  return (2 * intersection) / (ba.size + bb.size);
}

/** Manual alias map: known name variations that fuzzy matching cannot catch.
 *  Maps normalized extrato name → normalized cadastro name. */
const MANUAL_NAME_ALIASES: Record<string, string> = {
  'FRANCIELLY FELIX CAVALCANTE DE ANDRADE': 'FRANCIELLY CAVALCANTE SANTOS DE ANDRADE',
  'FRANCIELLY CAVALCANTE SANTOS DE ANDRADE': 'FRANCIELLY FELIX CAVALCANTE DE ANDRADE',
  'ROGERIO GOMEA DE OLIVEIRA': 'ROGERIO GOMES DE OLIVEIRA',
  'ROGERIO GOMES DE OLIVEIRA': 'ROGERIO GOMEA DE OLIVEIRA',
  'EVERDON ESTEVES DOS SANTOS': 'EVERSON ESTEVES DOS SANTOS',
  'EVERSON ESTEVES DOS SANTOS': 'EVERDON ESTEVES DOS SANTOS',
  'CLEBERSON APARECIDO BORGES DOS SANTOS': 'CLEBERSON APARECIDO BORGES DO SANTOS',
  'CLEBERSON APARECIDO BORGES DO SANTOS': 'CLEBERSON APARECIDO BORGES DOS SANTOS',
};

/** Build normalized name → CPF map from cadastro rows.
 *  On duplicate names, prefer the row with non-empty situacao (real user over ghost entry). */
export function buildNomeToCpf(
  cadastro: { cpf: string; colaborador: string | null; situacao?: string | null }[]
): Map<string, string> {
  const nomeToCpf = new Map<string, string>();
  const nomeHasSituacao = new Set<string>();
  for (const c of cadastro) {
    const normalized = normalizeName(c.colaborador);
    if (!normalized || !c.cpf) continue;
    const hasSituacao = c.situacao !== null && c.situacao !== undefined && c.situacao !== '';
    if (!nomeToCpf.has(normalized)) {
      nomeToCpf.set(normalized, c.cpf);
      if (hasSituacao) nomeHasSituacao.add(normalized);
    } else if (hasSituacao && !nomeHasSituacao.has(normalized)) {
      nomeToCpf.set(normalized, c.cpf);
      nomeHasSituacao.add(normalized);
    }
  }
  return nomeToCpf;
}

/** Resolve extrato usuario name to CPF via exact normalized match, then manual aliases, then fuzzy (>= 0.88), then prefix */
export function resolveCpfByName(
  extratoName: string,
  nomeToCpf: Map<string, string>,
  fuzzyCache: Map<string, string>
): string | undefined {
  const normalized = normalizeName(extratoName);
  const exact = nomeToCpf.get(normalized);
  if (exact) return exact;
  const alias = MANUAL_NAME_ALIASES[normalized];
  if (alias) {
    const aliasCpf = nomeToCpf.get(alias);
    if (aliasCpf) {
      fuzzyCache.set(normalized, aliasCpf);
      return aliasCpf;
    }
  }
  const cached = fuzzyCache.get(normalized);
  if (cached) return cached;
  let bestCpf: string | undefined;
  let bestRatio = 0;
  for (const [cadName, cpf] of nomeToCpf) {
    const ratio = fuzzyMatchRatio(normalized, cadName);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestCpf = cpf;
    }
  }
  if (bestRatio >= 0.88 && bestCpf) {
    fuzzyCache.set(normalized, bestCpf);
    return bestCpf;
  }
  // Truncated-name fallback: the bank statement may cut the holder name at a
  // fixed length. Only resolve when the normalized extrato name is a strict
  // prefix of exactly ONE cadastro name. A shared first-name prefix must never
  // match — different people ("GUILHERME JOSE" vs "GUILHERME BATISTA") would
  // silently merge their balances.
  if (normalized.length >= 10) {
    let match: string | undefined;
    let ambiguous = false;
    for (const [cadName, cpf] of nomeToCpf) {
      if (cadName.length > normalized.length && cadName.startsWith(normalized)) {
        if (match !== undefined && match !== cpf) { ambiguous = true; break; }
        match = cpf;
      }
    }
    if (!ambiguous && match) {
      fuzzyCache.set(normalized, match);
      return match;
    }
  }
  return undefined;
}
