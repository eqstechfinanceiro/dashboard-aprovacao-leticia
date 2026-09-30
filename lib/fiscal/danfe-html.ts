// Gera uma página HTML standalone que renderiza o XML da NF-e em layout
// estilo DANFE (parser roda no browser com DOMParser — sem dep server-side).

export function danfeHtml(xmlText: string): string {
  const embedded = JSON.stringify(xmlText).replace(/<\//g, '<\\/');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>DANFE</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 16px; max-width: 900px; margin: 0 auto; }
  .err { color: #b91c1c; padding: 24px; font-size: 14px; }
  h1 { font-size: 15px; text-align: center; margin-bottom: 8px; }
  .box { border: 1px solid #000; margin-bottom: -1px; }
  .row { display: flex; flex-wrap: wrap; }
  .cell { border-right: 1px solid #000; padding: 3px 5px; flex: 1; min-width: 0; }
  .cell:last-child { border-right: none; }
  .lbl { font-size: 8px; text-transform: uppercase; color: #444; display: block; margin-bottom: 1px; }
  .val { font-size: 11px; word-break: break-word; }
  .sec { border: 1px solid #000; border-top: none; padding: 3px 5px; font-weight: bold; font-size: 10px; background: #eee; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #000; padding: 2px 4px; text-align: left; }
  th { font-size: 8px; text-transform: uppercase; background: #eee; }
  td.r, th.r { text-align: right; }
  .tot-row td { font-weight: normal; }
</style>
</head>
<body>
<div id="app"></div>
<script>
var xml = ${embedded};
var app = document.getElementById('app');
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(v) { var n = parseFloat(v); return isNaN(n) ? esc(v || '') : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(v) { return v ? esc(String(v).substring(0, 10).split('-').reverse().join('/')) : ''; }
try {
  var doc = new DOMParser().parseFromString(xml, 'application/xml');
  var inf = doc.querySelector('infNFe');
  if (!inf) { app.innerHTML = '<div class="err">XML não é uma NF-e (infNFe não encontrado).</div>'; throw 0; }
  function T(scope, path) {
    var el = scope;
    for (var i = 0; i < path.length; i++) { el = el && el.querySelector ? el.querySelector(path[i]) : null; }
    return el ? el.textContent : '';
  }
  var ide = inf.querySelector('ide'), emit = inf.querySelector('emit'), dest = inf.querySelector('dest');
  var enderEmit = emit && emit.querySelector('enderEmit'), enderDest = dest && dest.querySelector('enderDest');
  var tot = inf.querySelector('ICMSTot');
  var html = '';
  html += '<h1>DANFE — Documento Auxiliar da NF-e</h1>';
  html += '<div class="box"><div class="row">' +
    '<div class="cell" style="flex:3"><span class="lbl">Emitente</span><span class="val"><b>' + esc(T(emit,['xNome'])) + '</b></span></div>' +
    '<div class="cell"><span class="lbl">CNPJ</span><span class="val">' + esc(T(emit,['CNPJ']) || T(emit,['CPF'])) + '</span></div>' +
    '<div class="cell"><span class="lbl">IE</span><span class="val">' + esc(T(emit,['IE'])) + '</span></div></div>' +
    '<div class="row"><div class="cell" style="flex:3"><span class="lbl">Endereço</span><span class="val">' +
      esc(T(enderEmit,['xLgr']) + ', ' + T(enderEmit,['nro']) + ' - ' + T(enderEmit,['xBairro']) + ' - ' + T(enderEmit,['xMun']) + '/' + T(enderEmit,['UF'])) + '</span></div></div></div>';
  html += '<div class="box"><div class="row">' +
    '<div class="cell"><span class="lbl">Número</span><span class="val"><b>' + esc(T(ide,['nNF'])) + '</b></span></div>' +
    '<div class="cell"><span class="lbl">Série</span><span class="val">' + esc(T(ide,['serie'])) + '</span></div>' +
    '<div class="cell"><span class="lbl">Emissão</span><span class="val">' + fmtDate(T(ide,['dhEmi']) || T(ide,['dEmi'])) + '</span></div>' +
    '<div class="cell"><span class="lbl">Natureza</span><span class="val">' + esc(T(ide,['natOp'])) + '</span></div></div>' +
    '<div class="row"><div class="cell" style="flex:4"><span class="lbl">Chave de acesso</span><span class="val">' + esc((inf.getAttribute('Id') || '').replace(/^NFe/, '')) + '</span></div></div></div>';
  if (dest) {
    html += '<div class="sec">Destinatário / Remetente</div><div class="box"><div class="row">' +
      '<div class="cell" style="flex:3"><span class="lbl">Nome</span><span class="val"><b>' + esc(T(dest,['xNome'])) + '</b></span></div>' +
      '<div class="cell"><span class="lbl">CNPJ/CPF</span><span class="val">' + esc(T(dest,['CNPJ']) || T(dest,['CPF'])) + '</span></div>' +
      '<div class="cell"><span class="lbl">IE</span><span class="val">' + esc(T(dest,['IE'])) + '</span></div></div>' +
      '<div class="row"><div class="cell"><span class="lbl">Endereço</span><span class="val">' +
        esc(T(enderDest,['xLgr']) + ', ' + T(enderDest,['nro']) + ' - ' + T(enderDest,['xBairro']) + ' - ' + T(enderDest,['xMun']) + '/' + T(enderDest,['UF'])) + '</span></div></div></div>';
  }
  html += '<div class="sec">Produtos e Serviços</div><div class="box"><table><thead><tr>' +
    '<th>Código</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>CST</th><th class="r">Qtd</th><th class="r">V.Unit</th><th class="r">V.Total</th><th class="r">BC ICMS</th><th class="r">ICMS</th><th class="r">IPI</th>' +
    '</tr></thead><tbody>';
  var dets = inf.querySelectorAll('det');
  for (var i = 0; i < dets.length; i++) {
    var d = dets[i], prod = d.querySelector('prod'), imp = d.querySelector('imposto');
    var icms = imp && (imp.querySelector('ICMS > *') || null);
    var ipi = imp && imp.querySelector('IPI > *');
    html += '<tr><td>' + esc(T(prod,['cProd'])) + '</td><td>' + esc(T(prod,['xProd'])) + '</td><td>' + esc(T(prod,['NCM'])) +
      '</td><td>' + esc(T(prod,['CFOP'])) + '</td><td>' + esc(icms ? (T(icms,['CST']) || T(icms,['CSOSN'])) : '') +
      '</td><td class="r">' + fmt(T(prod,['qCom'])) + '</td><td class="r">' + fmt(T(prod,['vUnCom'])) + '</td><td class="r">' + fmt(T(prod,['vProd'])) +
      '</td><td class="r">' + fmt(icms && T(icms,['vBC'])) + '</td><td class="r">' + fmt(icms && T(icms,['vICMS'])) + '</td><td class="r">' + fmt(ipi && T(ipi,['vIPI'])) + '</td></tr>';
  }
  html += '</tbody></table></div>';
  if (tot) {
    html += '<div class="sec">Totais</div><div class="box"><table><thead><tr>' +
      '<th class="r">BC ICMS</th><th class="r">V. ICMS</th><th class="r">BC ICMS-ST</th><th class="r">V. ICMS-ST</th><th class="r">V. Produtos</th><th class="r">V. Frete</th><th class="r">V. Seguro</th><th class="r">V. Desconto</th><th class="r">V. IPI</th><th class="r">V. NF</th>' +
      '</tr></thead><tbody><tr class="tot-row">' +
      '<td class="r">' + fmt(T(tot,['vBC'])) + '</td><td class="r">' + fmt(T(tot,['vICMS'])) + '</td><td class="r">' + fmt(T(tot,['vBCST'])) + '</td><td class="r">' + fmt(T(tot,['vST'])) +
      '</td><td class="r">' + fmt(T(tot,['vProd'])) + '</td><td class="r">' + fmt(T(tot,['vFrete'])) + '</td><td class="r">' + fmt(T(tot,['vSeg'])) + '</td><td class="r">' + fmt(T(tot,['vDesc'])) +
      '</td><td class="r">' + fmt(T(tot,['vIPI'])) + '</td><td class="r"><b>' + fmt(T(tot,['vNF'])) + '</b></td></tr></tbody></table></div>';
  }
  var infAdic = inf.querySelector('infAdic');
  if (infAdic && T(infAdic,['infCpl'])) html += '<div class="sec">Informações Complementares</div><div class="box" style="padding:4px 6px">' + esc(T(infAdic,['infCpl'])) + '</div>';
  app.innerHTML = html;
} catch (e) { if (e !== 0) app.innerHTML = '<div class="err">Erro ao interpretar o XML: ' + esc(e && e.message) + '</div>'; }
</scr` + `ipt>
</body>
</html>`;
}
