/**
 * Bot Bradesco 50 em 50 — injetado via popup da extensão Aery (allFrames).
 * Cria um painel flutuante que marca os checkboxes da grade de conciliação
 * em lotes de 50 (o Bradesco só aceita 50 por vez).
 *
 * A grade mora no iframe `paginaCentral`. Se ele for same-origin, o painel do
 * frame top já enxerga as caixinhas (varredura desce por window.frames). Se
 * for cross-origin, o próprio iframe cria o painel dentro dele — o top não
 * consegue ler o DOM dele de fora.
 */
(() => {
  const CONFIG = { tamanhoLote: 50, pularPrimeiraCaixa: true };
  const PANEL_ID = 'aery-bot-caixinhas-50';
  const GRADE_SEL = "#GRID_CONCILIACAO_TITULOS, [id*='GRID_CONCILIACAO'], table.tabResult";

  const isTop = window === window.top;
  if (!isTop) {
    const topMeAlcanca = (() => { try { return !!window.top.document; } catch (_) { return false; } })();
    const tenhoGrade = !!document.querySelector(GRADE_SEL) ||
      document.querySelectorAll("input[type='checkbox']").length > 2;
    if (topMeAlcanca || !tenhoGrade) return; // painel do top cobre este frame
  }

  // Re-clique no botão do popup = reabrir/reinjetar — remove o painel velho
  document.getElementById(PANEL_ID)?.remove();

  let inicioAtual = 0;
  let loteAtual = [];
  let destaques = [];

  function visivel(el) {
    if (!el || el.disabled) return false;
    try {
      const s = el.ownerDocument.defaultView.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
    } catch (_) { return true; }
  }

  function coletarDocumentos(w, lista) {
    if (!w) w = window;
    if (!lista) lista = [];
    try { lista.push(w.document); } catch (_) {}
    try {
      for (let i = 0; i < w.frames.length; i++) {
        try { coletarDocumentos(w.frames[i], lista); } catch (_) {}
      }
    } catch (_) {}
    return lista;
  }

  function buscarCaixinhasNoDoc(d) {
    const encontradas = [];
    try {
      const grade =
        d.querySelector('#GRID_CONCILIACAO_TITULOS') ||
        d.querySelector("[id*='GRID_CONCILIACAO']") ||
        d.querySelector('table.tabResult') ||
        d.querySelector("table[id*='_id38']") ||
        d;

      let caixas = [...grade.querySelectorAll(
        "input[type='checkbox'][name*='SELECIONAR' i], input[type='checkbox'][id*='SELECIONAR' i]"
      )];
      if (!caixas.length) caixas = [...grade.querySelectorAll("input[type='checkbox'].chkSel")];
      if (!caixas.length) caixas = [...grade.querySelectorAll("input[type='checkbox'].frmCheck")];
      if (!caixas.length) caixas = [...grade.querySelectorAll("input[type='checkbox']")];

      caixas
        .filter(c => visivel(c))
        .filter(c => !c.closest('#' + PANEL_ID))
        .forEach(c => { if (!encontradas.includes(c)) encontradas.push(c); });
    } catch (_) {}
    return encontradas;
  }

  function buscarCaixinhas() {
    const encontradas = [];
    coletarDocumentos().forEach(d => {
      buscarCaixinhasNoDoc(d).forEach(c => {
        if (!encontradas.includes(c)) encontradas.push(c);
      });
    });
    // A 1ª caixinha costuma ser o checkbox "selecionar todos" do cabeçalho
    if (CONFIG.pularPrimeiraCaixa && encontradas.length > 1) encontradas.shift();
    return encontradas;
  }

  function limparDestaques() {
    destaques.forEach(c => {
      try { c.style.outline = ''; c.style.outlineOffset = ''; } catch (_) {}
    });
    destaques = [];
  }

  function clicar(caixa, marcar) {
    if (caixa.checked !== marcar) {
      caixa.click();
      if (caixa.checked !== marcar) {
        caixa.checked = marcar;
        caixa.dispatchEvent(new Event('change', { bubbles: true }));
        caixa.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function modoTeste() {
    return document.getElementById('aery-bot-modo-teste')?.checked ?? false;
  }

  function atualizarContagem(msg) {
    if (!msg) msg = '';
    const caixas = buscarCaixinhas();
    const marcadas = caixas.filter(c => c.checked).length;
    const totalLotes = Math.ceil(caixas.length / CONFIG.tamanhoLote);
    const loteNum = Math.min(totalLotes, Math.floor(inicioAtual / CONFIG.tamanhoLote) + 1);
    const el = document.getElementById('aery-bot-contagem');
    if (el) {
      el.innerHTML =
        'Total encontradas: <b>' + caixas.length + '</b><br>' +
        'Marcadas: <b>' + marcadas + '</b> · Desmarcadas: <b>' + (caixas.length - marcadas) + '</b><br>' +
        (caixas.length > 0
          ? 'Lote <b>' + loteNum + ' de ' + totalLotes + '</b> — caixas <b>' +
            (inicioAtual + 1) + ' a ' + Math.min(inicioAtual + CONFIG.tamanhoLote, caixas.length) + '</b>'
          : 'Nenhuma caixinha encontrada — abra a grade de conciliação') +
        (msg ? '<br><span style="color:#ffd966">' + msg + '</span>' : '');
    }
  }

  function marcarLote(inicio) {
    if (inicio === undefined) inicio = inicioAtual;
    limparDestaques();
    const caixas = buscarCaixinhas();
    if (!caixas.length) { atualizarContagem('Nenhuma caixinha encontrada.'); return; }
    if (inicio >= caixas.length) { atualizarContagem('Fim da lista — não há mais caixinhas.'); return; }

    inicioAtual = inicio;
    loteAtual = caixas.slice(inicioAtual, inicioAtual + CONFIG.tamanhoLote);

    if (modoTeste()) {
      loteAtual.forEach(c => {
        c.style.outline = '3px solid orange';
        c.style.outlineOffset = '2px';
        destaques.push(c);
      });
      atualizarContagem('MODO TESTE: ' + loteAtual.length + ' caixas destacadas, nada clicado.');
      return;
    }

    loteAtual.forEach(c => clicar(c, true));
    atualizarContagem(loteAtual.length + ' caixas marcadas.');
  }

  function desmarcarEAvancar() {
    limparDestaques();
    if (!loteAtual.length) { atualizarContagem('Nenhum lote atual. Clique em Marcar.'); return; }
    if (modoTeste()) { atualizarContagem('Desative o MODO TESTE primeiro.'); return; }
    loteAtual.forEach(c => clicar(c, false));
    inicioAtual += CONFIG.tamanhoLote;
    marcarLote(inicioAtual);
  }

  function voltarLote() {
    limparDestaques();
    if (!modoTeste()) loteAtual.forEach(c => clicar(c, false));
    inicioAtual = Math.max(0, inicioAtual - CONFIG.tamanhoLote);
    marcarLote(inicioAtual);
  }

  function reiniciar() {
    limparDestaques();
    inicioAtual = 0;
    loteAtual = [];
    atualizarContagem('Reiniciado.');
  }

  const painel = document.createElement('div');
  painel.id = PANEL_ID;
  painel.style.cssText =
    'position:fixed;top:15px;right:15px;width:290px;z-index:2147483647;' +
    'background:#152238;color:#fff;padding:0 0 14px;border:2px solid #4da3ff;' +
    'border-radius:10px;font:13px Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.4)';

  painel.innerHTML =
    '<div id="aery-bot-titulo" style="font-size:14px;font-weight:bold;padding:10px 14px;cursor:move;' +
      'background:#0e1a30;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center">' +
      '<span>Aery · Bradesco 50 em 50</span>' +
      '<span id="aery-bot-fechar" style="cursor:pointer;font-size:16px;padding:0 4px" title="Fechar">✕</span>' +
    '</div>' +
    '<div style="padding:10px 14px 0">' +
      '<label style="display:block;margin-bottom:8px"><input id="aery-bot-modo-teste" type="checkbox" checked> MODO TESTE (só destaca)</label>' +
      '<div id="aery-bot-contagem" style="margin-bottom:8px;line-height:1.5"></div>' +
      '<button id="aery-bot-marcar">Marcar próximas 50</button>' +
      '<button id="aery-bot-avancar">Desmarcar atual e avançar</button>' +
      '<button id="aery-bot-voltar">Voltar 1 lote</button>' +
      '<button id="aery-bot-reiniciar">Reiniciar</button>' +
      '<button id="aery-bot-atualizar">Atualizar contagem</button>' +
    '</div>';

  painel.querySelectorAll('button').forEach(b => {
    b.style.cssText = 'width:100%;margin-top:6px;padding:8px;cursor:pointer;border:0;border-radius:5px;font-weight:bold';
  });

  document.body.appendChild(painel);

  document.getElementById('aery-bot-marcar').onclick = () => marcarLote(inicioAtual);
  document.getElementById('aery-bot-avancar').onclick = desmarcarEAvancar;
  document.getElementById('aery-bot-voltar').onclick = voltarLote;
  document.getElementById('aery-bot-reiniciar').onclick = reiniciar;
  document.getElementById('aery-bot-atualizar').onclick = () => atualizarContagem();
  document.getElementById('aery-bot-fechar').onclick = () => { limparDestaques(); painel.remove(); };
  document.getElementById('aery-bot-modo-teste').onchange = () => { limparDestaques(); atualizarContagem(); };

  // Painel arrastável pela barra de título
  const titulo = document.getElementById('aery-bot-titulo');
  titulo.addEventListener('mousedown', (ev) => {
    if (ev.target.id === 'aery-bot-fechar') return;
    ev.preventDefault();
    const rect = painel.getBoundingClientRect();
    const offX = ev.clientX - rect.left;
    const offY = ev.clientY - rect.top;
    painel.style.right = 'auto';
    const move = (e) => {
      painel.style.left = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - offX)) + 'px';
      painel.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offY)) + 'px';
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  atualizarContagem('Pronto — injetado pela extensão Aery.');
})();
