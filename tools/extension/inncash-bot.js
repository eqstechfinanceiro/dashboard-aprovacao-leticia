/**
 * Bot InnCash — selecionar empresas por prefixo — injetado via popup da extensão Aery.
 *
 * Cria um painel flutuante com botões (EQS, BRATEC) que marcam TODAS as
 * checkboxes do multi-select "Empresa" na página de Remessas de Pagamento,
 * clicando item a item como um usuário faria (a lista é um v-select do
 * Vuetify — o menu abre como .v-menu__content.menuable__content__active).
 */
(() => {
  const PANEL_ID = 'aery-bot-inncash';
  const MENU_SEL = '.v-menu__content.menuable__content__active';
  const ITEM_SEL = '.v-list-item';
  const DELAY_CLIQUE = 60;

  // Em iframe sem o campo Empresa não há nada pra fazer
  const temEmpresa = (doc) =>
    [...doc.querySelectorAll('.v-input')].some(i =>
      /empresa/i.test(i.querySelector('label')?.textContent || ''));
  const isTop = window === window.top;
  if (!isTop && !temEmpresa(document)) return;

  // Re-clique no botão do popup = reinjetar — remove painel velho
  document.getElementById(PANEL_ID)?.remove();

  let rodando = false;
  let destaques = [];

  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .trim();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function limparDestaques() {
    destaques.forEach((el) => {
      try {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.background = '';
      } catch (_) {}
    });
    destaques = [];
  }

  function destacar(el, cor) {
    el.style.outline = `3px solid ${cor || 'orange'}`;
    el.style.outlineOffset = '1px';
    el.style.background = '#fff7e0';
    destaques.push(el);
  }

  /* ---------- localizar o v-select "Empresa" ---------- */
  function campoEmpresa() {
    const inputs = [...document.querySelectorAll('.v-input')];
    return (
      inputs.find((i) =>
        /^empresa/i.test(norm(i.querySelector('label')?.textContent || ''))
      ) || null
    );
  }

  /* ---------- menu aberto ---------- */
  function menuAberto() {
    const menus = [...document.querySelectorAll(MENU_SEL)]
      .filter((m) => m.querySelectorAll(ITEM_SEL).length);
    // se houver mais de um menu aberto, pega o maior (o de empresas)
    return menus.sort(
      (a, b) =>
        b.querySelectorAll(ITEM_SEL).length - a.querySelectorAll(ITEM_SEL).length
    )[0] || null;
  }

  async function abrirMenu() {
    let menu = menuAberto();
    if (menu) return menu;

    const campo = campoEmpresa();
    if (!campo) throw new Error('Campo "Empresa" não encontrado na página.');
    const alvo =
      campo.querySelector('.v-select__slot input') ||
      campo.querySelector('.v-select__slot') ||
      campo;
    alvo.click();

    for (let i = 0; i < 50 && !menu; i++) {
      await sleep(100);
      menu = menuAberto();
    }
    if (!menu) throw new Error('O dropdown do Empresa não abriu.');
    return menu;
  }

  async function fecharMenu() {
    const overlay = document.querySelector('.v-overlay--active');
    if (overlay) overlay.click();
    else document.body.click();
    await sleep(150);
  }

  /* ---------- itens ---------- */
  function itens(menu) {
    return [...(menu || menuAberto() || document).querySelectorAll(ITEM_SEL)]
      .map((el) => ({
        el,
        texto: (el.querySelector('.v-list-item__title') || el).textContent.trim(),
        marcado:
          !!el.querySelector('.mdi-checkbox-marked') ||
          el.classList.contains('v-list-item--active'),
      }))
      .filter((x) => x.texto);
  }

  /* ---------- contagem na UI ---------- */
  function atualizarContagem(msg) {
    const el = document.getElementById('aery-inn-contagem');
    if (!el) return;
    const campo = campoEmpresa();
    const menu = menuAberto();
    const marcados = menu ? itens(menu).filter((i) => i.marcado).length : null;
    el.innerHTML =
      'Campo Empresa: <b>' +
      (campo ? 'encontrado' : 'NÃO encontrado') +
      '</b><br>' +
      'Dropdown: <b>' +
      (menu ? 'aberto (' + itens(menu).length + ' itens)' : 'fechado') +
      '</b>' +
      (marcados !== null
        ? '<br>Marcados no menu: <b>' + marcados + '</b>'
        : '') +
      (msg ? '<br><span style="color:#7ee2a8">' + msg + '</span>' : '');
  }

  /* ---------- ação principal ---------- */
  async function selecionar(prefixo) {
    if (rodando) return;
    rodando = true;
    const botoes = [...document.querySelectorAll('#' + PANEL_ID + ' button')];
    botoes.forEach((b) => (b.disabled = true));
    limparDestaques();

    try {
      atualizarContagem('Abrindo dropdown…');
      const menu = await abrirMenu();
      const todos = itens(menu);
      const alvos = todos.filter((i) => norm(i.texto).startsWith(norm(prefixo)));

      if (!alvos.length) {
        atualizarContagem(
          'Nenhum item começa com "' + prefixo + '" (' + todos.length + ' no menu).'
        );
        return;
      }

      const faltantes = alvos.filter((i) => !i.marcado);
      let clicados = 0;
      atualizarContagem('Marcando ' + faltantes.length + ' de ' + alvos.length + '…');

      for (const item of faltantes) {
        destacar(item.el, '#7ee2a8');
        try { item.el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        await sleep(DELAY_CLIQUE);
        item.el.click();
        clicados++;
        if (clicados % 10 === 0)
          atualizarContagem('Marcando… ' + clicados + '/' + faltantes.length);
      }

      await sleep(200);
      await fecharMenu();
      limparDestaques();
      atualizarContagem(
        clicados
          ? clicados + ' empresa(s) "' + prefixo + '" marcadas.'
          : 'As ' + alvos.length + ' "' + prefixo + '" já estavam marcadas.'
      );
    } catch (e) {
      limparDestaques();
      atualizarContagem('Erro: ' + (e?.message || e));
    } finally {
      botoes.forEach((b) => (b.disabled = false));
      rodando = false;
    }
  }

  /* ---------- painel ---------- */
  const painel = document.createElement('div');
  painel.id = PANEL_ID;
  painel.style.cssText =
    'position:fixed;top:15px;right:15px;width:280px;z-index:2147483647;' +
    'background:#152238;color:#fff;padding:0 0 14px;border:2px solid #4da3ff;' +
    'border-radius:10px;font:13px Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.4)';

  painel.innerHTML =
    '<div id="aery-inn-titulo" style="font-size:14px;font-weight:bold;padding:10px 14px;cursor:move;' +
      'background:#0e1a30;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center">' +
      '<span>Aery · InnCash Empresas</span>' +
      '<span id="aery-inn-fechar" style="cursor:pointer;font-size:16px;padding:0 4px" title="Fechar">✕</span>' +
    '</div>' +
    '<div style="padding:10px 14px 0">' +
      '<div style="display:flex;gap:6px;margin-bottom:8px">' +
        '<button id="aery-inn-eqs" style="flex:1">Marcar EQS</button>' +
        '<button id="aery-inn-bratec" style="flex:1">Marcar BRATEC</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:8px">' +
        '<input id="aery-inn-prefixo" placeholder="Outro prefixo…" ' +
          'style="flex:1;padding:6px 8px;border:1px solid #35507a;border-radius:5px;background:#0e1a30;color:#fff;font-size:12px">' +
        '<button id="aery-inn-custom" style="width:80px">Marcar</button>' +
      '</div>' +
      '<div id="aery-inn-contagem" style="margin-bottom:8px;line-height:1.5"></div>' +
      '<button id="aery-inn-atualizar">Atualizar contagem</button>' +
    '</div>';

  painel.querySelectorAll('button').forEach((b) => {
    b.style.cssText =
      'margin-top:4px;padding:8px;cursor:pointer;border:0;border-radius:5px;font-weight:bold;' +
      'background:#2563eb;color:#fff';
  });

  document.body.appendChild(painel);

  document.getElementById('aery-inn-eqs').onclick = () => selecionar('EQS');
  document.getElementById('aery-inn-bratec').onclick = () => selecionar('BRATEC');
  document.getElementById('aery-inn-custom').onclick = () => {
    const p = document.getElementById('aery-inn-prefixo').value.trim();
    if (p) selecionar(p);
  };
  document.getElementById('aery-inn-prefixo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('aery-inn-custom').click();
  });
  document.getElementById('aery-inn-atualizar').onclick = () => atualizarContagem();
  document.getElementById('aery-inn-fechar').onclick = () => {
    limparDestaques();
    painel.remove();
  };

  // Painel arrastável pela barra de título
  const titulo = document.getElementById('aery-inn-titulo');
  titulo.addEventListener('mousedown', (ev) => {
    if (ev.target.id === 'aery-inn-fechar') return;
    ev.preventDefault();
    const rect = painel.getBoundingClientRect();
    const offX = ev.clientX - rect.left;
    const offY = ev.clientY - rect.top;
    painel.style.right = 'auto';
    const move = (e) => {
      painel.style.left =
        Math.max(0, Math.min(window.innerWidth - 60, e.clientX - offX)) + 'px';
      painel.style.top =
        Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offY)) + 'px';
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
