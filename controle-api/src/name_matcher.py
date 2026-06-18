#!/usr/bin/env python3
"""
name_matcher.py
---------------
Sistema de matching de nomes entre o extrato (campo `usuario`, sem CPF) e o
cadastro (team-members / planilha de controle, com nome + CPF).

Trata: diferenca de maiusculas, acentos, espacos multiplos, particulas (DE/DA/DOS),
e pequenas variacoes de digitacao (1 letra trocada) via fuzzy matching.

API:
    matcher = NameMatcher(nomes_cadastro)      # lista de nomes de referencia
    resultado = matcher.match("Jonas Cavalcanti de Oliveira")
    # -> MatchResult(nome_original, nome_match, score, metodo) ou None
"""
import unicodedata
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

# Particulas ignoradas na comparacao por tokens
_PARTICULAS = {"de", "da", "do", "das", "dos", "e"}


def normalizar(nome: str) -> str:
    """MAIUSCULAS, sem acento, sem pontuacao, espacos colapsados."""
    if not nome:
        return ""
    # remove acentos
    nfkd = unicodedata.normalize("NFKD", str(nome))
    sem_acento = "".join(c for c in nfkd if not unicodedata.combining(c))
    # maiuscula, troca nao-alfanumerico por espaco
    s = re.sub(r"[^A-Za-z0-9 ]", " ", sem_acento.upper())
    # colapsa espacos
    return re.sub(r"\s+", " ", s).strip()


def _tokens(nome_norm: str) -> list[str]:
    return [t for t in nome_norm.split() if t not in {p.upper() for p in _PARTICULAS}]


def _token_set_ratio(a: str, b: str) -> float:
    """Similaridade ignorando ordem/particulas (set de tokens ordenado)."""
    ta = " ".join(sorted(_tokens(a)))
    tb = " ".join(sorted(_tokens(b)))
    if not ta or not tb:
        return 0.0
    return SequenceMatcher(None, ta, tb).ratio()


@dataclass
class MatchResult:
    nome_original: str
    nome_match: str
    score: float
    metodo: str  # "exato" | "fuzzy"


class NameMatcher:
    def __init__(self, nomes_referencia: list[str], threshold: float = 0.88):
        self.threshold = threshold
        # mapa nome_normalizado -> nome_original (referencia)
        self._ref = {}
        for n in nomes_referencia:
            if n:
                self._ref[normalizar(n)] = n
        self._ref_norms = list(self._ref.keys())

    def match(self, nome: str) -> "MatchResult | None":
        norm = normalizar(nome)
        if not norm:
            return None

        # 1. match exato (normalizado)
        if norm in self._ref:
            return MatchResult(nome, self._ref[norm], 1.0, "exato")

        # 2. match por set de tokens exato (ordem/particulas diferentes)
        alvo_tokens = " ".join(sorted(_tokens(norm)))
        for rn in self._ref_norms:
            if " ".join(sorted(_tokens(rn))) == alvo_tokens and alvo_tokens:
                return MatchResult(nome, self._ref[rn], 0.99, "exato")

        # 3. fuzzy: melhor score por token_set_ratio + ratio direto
        melhor, melhor_score = None, 0.0
        for rn in self._ref_norms:
            s = max(_token_set_ratio(norm, rn), SequenceMatcher(None, norm, rn).ratio())
            if s > melhor_score:
                melhor, melhor_score = rn, s

        if melhor and melhor_score >= self.threshold:
            return MatchResult(nome, self._ref[melhor], round(melhor_score, 4), "fuzzy")
        return None


def construir_mapa(nomes_origem: list[str], nomes_referencia: list[str],
                   threshold: float = 0.88) -> tuple[dict, list]:
    """Retorna (mapa nome_origem->nome_referencia, lista de nao-encontrados)."""
    matcher = NameMatcher(nomes_referencia, threshold)
    mapa, nao_encontrados = {}, []
    for nome in nomes_origem:
        r = matcher.match(nome)
        if r:
            mapa[nome] = r
        else:
            nao_encontrados.append(nome)
    return mapa, nao_encontrados


if __name__ == "__main__":
    # teste rapido
    ref = ["JONAS CAVALCANTI DE OLIVEIRA", "ABNER ANDRADE CAVALCANTE",
           "MÁRCIO JOSÉ DA SILVA", "ANA PAULA SOUZA"]
    m = NameMatcher(ref)
    for teste in ["Jonas Cavalcanti de Oliveira", "ABNER ANDRADE CAVALCANTE",
                  "Marcio Jose da Silva", "Ana P. Souza", "MARCIO J SILVA",
                  "Fulano Inexistente"]:
        r = m.match(teste)
        print(f"{teste!r:38} -> {r}")
