/**
 * Validação de boletos — códigos FEBRABAN (cobrança) e arrecadação.
 *
 * Cobrança (44 dígitos código de barras / 47 linha digitável):
 *   codbar = banco(3) moeda(1) dvGeral(1) fator(4) valor(10) campoLivre(25)
 *   lindig = banco+moeda+livre[0:5]+dv1 | livre[5:15]+dv2 | livre[15:25]+dv3
 *            | dvGeral | fator+valor
 * Arrecadação (48 dígitos linha digitável, começa com '8'):
 *   4 campos de 12; DV de cada campo = mod10 (digito verificador tipo 6/7)
 *   ou mod11 (tipo 8/9). Valor embutido quando tipoValor ∈ {6,7}.
 */

export type FlagTipo =
  | 'formato_invalido'
  | 'dv_campo_invalido'
  | 'dv_geral_invalido'
  | 'lindig_diverge_codbar'
  | 'valor_divergente'
  | 'vencimento_divergente'
  | 'codbar_duplicado'
  | 'lado_ausente';

export interface Flag {
  tipo: FlagTipo;
  detalhe: string;
}

const onlyDigits = (s: string) => /^\d+$/.test(s);

// ---- helpers de DV ----------------------------------------------------------

/** mod10 FEBRABAN: pesos 2,1,2,1... da direita pra esquerda, soma dos dígitos dos produtos. */
function dvMod10(base: string): number {
  let sum = 0;
  let w = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    const p = Number(base[i]) * w;
    sum += Math.floor(p / 10) + (p % 10);
    w = w === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

/** mod11 FEBRABAN (código de barras cobrança): pesos 2..9 cíclicos da direita pra esquerda. */
function dvMod11(base: string): number {
  let sum = 0;
  let w = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const resto = sum % 11;
  const dv = 11 - resto;
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** mod11 arrecadação: pesos 1..2? — FEBRABAN usa 1,2,1,2 para arrecadação? Não: mod11 padrão 2..9. */
function dvMod11Arrec(base: string): number {
  let sum = 0;
  let w = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const resto = sum % 11;
  const dv = 11 - resto;
  return dv === 0 || dv === 10 || dv === 11 ? 0 : dv; // arrecadação: 0,10,11 -> 0
}

/** mod10 arrecadação — pesos 1,2 alternados começando com 2 pela esquerda. */
function dvMod10Arrec(base: string): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    const p = Number(base[i]) * (i % 2 === 0 ? 2 : 1);
    sum += Math.floor(p / 10) + (p % 10);
  }
  return (10 - (sum % 10)) % 10;
}

// ---- fator de vencimento -----------------------------------------------------

const FATOR_BASE_OLD = new Date(1997, 9, 7); // 07/10/1997
const FATOR_BASE_NEW = new Date(2025, 1, 22); // 22/02/2025 = fator 1000

/** Retorna as datas candidatas (esquema antigo e novo) para um fator. */
export function fatorDatas(fator: number): Date[] {
  const out: Date[] = [];
  if (fator > 0 && fator <= 9999) {
    const dOld = new Date(FATOR_BASE_OLD);
    dOld.setDate(dOld.getDate() + fator);
    out.push(dOld);
    if (fator >= 1000) {
      const dNew = new Date(FATOR_BASE_NEW);
      dNew.setDate(dNew.getDate() + (fator - 1000));
      out.push(dNew);
    }
  }
  return out;
}

const sameDay = (a: Date, iso: string) => {
  const y = a.getFullYear();
  const m = String(a.getMonth() + 1).padStart(2, '0');
  const d = String(a.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}` === iso;
};

// ---- cobrança ----------------------------------------------------------------

/** Reconstrói o código de barras (44) a partir da linha digitável (47). */
export function lindigToCodbar(lindig: string): string | null {
  if (lindig.length !== 47 || !onlyDigits(lindig)) return null;
  const livre = lindig.slice(4, 9) + lindig.slice(10, 20) + lindig.slice(21, 31);
  return (
    lindig.slice(0, 4) + // banco+moeda
    lindig.slice(32, 33) + // dv geral
    lindig.slice(33, 47) + // fator+valor
    livre
  );
}

export interface CodbarParts {
  banco: string;
  moeda: string;
  dvGeral: string;
  fator: number;
  valorCentavos: number;
  campoLivre: string;
}

export function parseCodbar(codbar: string): CodbarParts | null {
  if (codbar.length !== 44 || !onlyDigits(codbar)) return null;
  return {
    banco: codbar.slice(0, 3),
    moeda: codbar.slice(3, 4),
    dvGeral: codbar.slice(4, 5),
    fator: Number(codbar.slice(5, 9)),
    valorCentavos: Number(codbar.slice(9, 19)),
    campoLivre: codbar.slice(19, 44),
  };
}

/** Valida uma linha digitável de cobrança (47 dígitos, não-arrecadação). */
export function validarLindig(lindig: string): Flag[] {
  const flags: Flag[] = [];
  if (lindig.length !== 47 || !onlyDigits(lindig)) {
    flags.push({ tipo: 'formato_invalido', detalhe: `Linha digitável com ${lindig.length} caracteres/não numérica` });
    return flags;
  }
  // DVs dos 3 campos livres (mod10)
  const campos = [
    { base: lindig.slice(0, 9), dv: lindig[9], nome: 'campo 1' },
    { base: lindig.slice(10, 20), dv: lindig[20], nome: 'campo 2' },
    { base: lindig.slice(21, 31), dv: lindig[31], nome: 'campo 3' },
  ];
  for (const c of campos) {
    if (dvMod10(c.base) !== Number(c.dv)) {
      flags.push({ tipo: 'dv_campo_invalido', detalhe: `DV inválido no ${c.nome} da linha digitável` });
    }
  }
  // DV geral (mod11 sobre o código de barras reconstruído)
  const codbar = lindigToCodbar(lindig);
  if (codbar) {
    const parts = parseCodbar(codbar);
    if (parts) {
      const base = codbar.slice(0, 4) + codbar.slice(5);
      if (dvMod11(base) !== Number(parts.dvGeral)) {
        flags.push({ tipo: 'dv_geral_invalido', detalhe: 'DV geral do código de barras inválido' });
      }
    }
  }
  return flags;
}

// ---- arrecadação -------------------------------------------------------------

/** Linha digitável de arrecadação (começa com '8', 48 dígitos, 4 campos de 12). */
export function validarArrecadacao(lindig: string): { flags: Flag[]; valorCentavos: number | null } {
  const flags: Flag[] = [];
  if (lindig.length !== 48 || !onlyDigits(lindig)) {
    flags.push({ tipo: 'formato_invalido', detalhe: `Arrecadação com ${lindig.length} caracteres/não numérica` });
    return { flags, valorCentavos: null };
  }
  const tipoDv = lindig[2]; // 6/7 -> mod10, 8/9 -> mod11
  const isMod10 = tipoDv === '6' || tipoDv === '7';
  for (let i = 0; i < 4; i++) {
    const campo = lindig.slice(i * 12, i * 12 + 12);
    const base = campo.slice(0, 11);
    const dv = Number(campo[11]);
    const esperado = isMod10 ? dvMod10Arrec(base) : dvMod11Arrec(base);
    if (esperado !== dv) {
      flags.push({ tipo: 'dv_campo_invalido', detalhe: `DV inválido no campo ${i + 1} (arrecadação)` });
    }
  }
  const valorCentavos = isMod10 ? Number(lindig.slice(4, 15)) : null;
  return { flags, valorCentavos };
}

// ---- validação consolidada do título -----------------------------------------

export interface TituloInput {
  lindig: string;
  codbar: string;
  valor: number; // E2_VALOR
  venctoReal: string | null; // E2_VENCREA 'YYYY-MM-DD'
}

export function validarTitulo(t: TituloInput): Flag[] {
  const flags: Flag[] = [];
  const lindig = (t.lindig || '').replace(/\D/g, '');
  const codbar = (t.codbar || '').replace(/\D/g, '');

  if (lindig && codbar && lindig !== codbar) {
    const rebuilt = lindigToCodbar(lindig);
    const cbDigits = codbar.length === 44 ? codbar : null;
    if (rebuilt && cbDigits && rebuilt !== cbDigits) {
      flags.push({ tipo: 'lindig_diverge_codbar', detalhe: 'Linha digitável e código de barras divergem' });
    }
  }
  if ((lindig && !codbar) || (!lindig && codbar)) {
    flags.push({ tipo: 'lado_ausente', detalhe: lindig ? 'Código de barras ausente' : 'Linha digitável ausente' });
  }

  const fonte = lindig || codbar;

  if (fonte.startsWith('8')) {
    // Arrecadação
    const { flags: f, valorCentavos } = validarArrecadacao(fonte);
    flags.push(...f);
    if (valorCentavos !== null && t.valor > 0) {
      if (Math.abs(valorCentavos - Math.round(t.valor * 100)) > 1) {
        flags.push({ tipo: 'valor_divergente', detalhe: `Código carrega R$ ${(valorCentavos / 100).toFixed(2)} vs título R$ ${t.valor.toFixed(2)}` });
      }
    }
    return flags;
  }

  // Cobrança — valida o que existir
  let parts: CodbarParts | null = null;
  if (lindig) {
    flags.push(...validarLindig(lindig));
    const rebuilt = lindigToCodbar(lindig);
    if (rebuilt) parts = parseCodbar(rebuilt);
  } else if (codbar) {
    parts = parseCodbar(codbar);
    if (!parts) {
      flags.push({ tipo: 'formato_invalido', detalhe: `Código de barras com ${codbar.length} caracteres/não numérico` });
      return flags;
    }
    const base = codbar.slice(0, 4) + codbar.slice(5);
    if (dvMod11(base) !== Number(parts.dvGeral)) {
      flags.push({ tipo: 'dv_geral_invalido', detalhe: 'DV geral do código de barras inválido' });
    }
  }

  if (parts) {
    // valor embutido
    if (t.valor > 0 && parts.valorCentavos > 0) {
      if (Math.abs(parts.valorCentavos - Math.round(t.valor * 100)) > 1) {
        flags.push({
          tipo: 'valor_divergente',
          detalhe: `Código carrega R$ ${(parts.valorCentavos / 100).toFixed(2)} vs título R$ ${t.valor.toFixed(2)}`,
        });
      }
    }
    // vencimento embutido — tolerância de ±3 dias: o código costuma carregar a
    // data original do boleto e o título guarda o vencto real ajustado. Só flaga
    // desvio maior (mês/ano errado, fator corrompido etc.).
    if (t.venctoReal && parts.fator > 0) {
      const datas = fatorDatas(parts.fator);
      if (!datas.some((d) => sameDay(d, t.venctoReal!))) {
        const alvo = new Date(t.venctoReal);
        const melhor = Math.min(
          ...datas.map((d) => Math.abs(Math.round((alvo.getTime() - d.getTime()) / 86400000)))
        );
        if (melhor > 3) {
          const dStr = datas.map((d) => d.toISOString().slice(0, 10)).join(' ou ');
          flags.push({
            tipo: 'vencimento_divergente',
            detalhe: `Fator ${parts.fator} → ${dStr} vs título ${t.venctoReal} (Δ${melhor}d)`,
          });
        }
      }
    }
  }

  return flags;
}
