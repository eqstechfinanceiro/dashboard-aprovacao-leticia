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
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #f3f4f6; padding: 16px; }
  .page { max-width: 1000px; margin: 0 auto; background: #fff; padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .err { color: #b91c1c; padding: 24px; font-size: 14px; }
  .head { display: flex; border: 2px solid #000; }
  .head .emit { flex: 1; border-right: 2px solid #000; padding: 6px; text-align: center; }
  .head .emit .nome { font-size: 14px; font-weight: bold; }
  .head .danfe { width: 260px; padding: 6px; text-align: center; }
  .head .danfe .t { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
  .chave { border: 1px solid #000; border-top: none; padding: 4px 6px; font-size: 12px; font-weight: bold; letter-spacing: 1px; }
  .box { border: 1px solid #000; margin-top: -1px; }
  .row { display: flex; }
  .cell { border-right: 1px solid #000; padding: 3px 5px; flex: 1; min-width: 0; overflow: hidden; }
  .cell:last-child { border-right: none; }
  .row + .row .cell { border-top: 1px solid #000; }
  .lbl { font-size: 7.5px; text-transform: uppercase; color: #555; display: block; margin-bottom: 1px; }
  .val { font-size: 11px; word-break: break-word; }
  .sec { border: 1px solid #000; border-top: none; padding: 3px 6px; font-weight: bold; font-size: 9.5px; background: #e5e7eb; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  th, td { border: 1px solid #000; padding: 2px 4px; text-align: left; vertical-align: top; }
  th { font-size: 7px; text-transform: uppercase; background: #e5e7eb; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  td.c, th.c { text-align: center; }
  .tot td { font-weight: normal; }
  .foot { font-size: 8.5px; color: #555; margin-top: 6px; display: flex; justify-content: space-between; }
  .muted { color: #888; }
  @media print {
    @page { size: A4 landscape; margin: 6mm; }
    body { background: #fff; padding: 0; }
    .page { max-width: none; width: 100%; padding: 0; box-shadow: none; }
    .box { overflow-x: visible !important; }
    table { table-layout: auto; font-size: 7.5px; }
    th, td { padding: 1px 2px; }
    th { font-size: 5.5px; }
    .tot { font-size: 7px; }
    .sec { font-size: 8px; }
  }
</style>
</head>
<body>
<div class="page" id="app"></div>
<script>
var xml = ${embedded};
var app = document.getElementById('app');
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmt(v){var n=parseFloat(v);return isNaN(n)?'':n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmt4(v){var n=parseFloat(v);return isNaN(n)?'':n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});}
function d(v){return v?esc(String(v).substring(0,10).split('-').reverse().join('/')):'';}
function dh(v){if(!v)return'';var t=String(v);return esc(t.substring(0,10).split('-').reverse().join('/')+' '+t.substring(11,16));}
function cnpj(v){v=String(v||'').replace(/\\D/g,'');return v.length===14?v.replace(/(\\d{2})(\\d{3})(\\d{3})(\\d{4})(\\d{2})/,'$1.$2.$3/$4-$5'):v.length===11?v.replace(/(\\d{3})(\\d{3})(\\d{3})(\\d{2})/,'$1.$2.$3-$4'):esc(v);}
function ender(e){if(!e)return'';var s=[e.xLgr,e.nro,e.xCpl].filter(Boolean).join(', ');var b=[e.xBairro,e.xMun,e.UF].filter(Boolean).join(' - ');var cep=e.CEP?'CEP '+String(e.CEP).replace(/(\\d{5})(\\d{3})/,'$1-$2'):'';return esc([s,b,cep].filter(Boolean).join(' · '));}
var ORIG={'0':'Nacional','1':'Estr. importação direta','2':'Estr. merc. interno','3':'Nac. >40% import.','4':'Nac. prod. conformidade','5':'Nac. ≤40% import.','6':'Estr. import. direta s/similar','7':'Estr. merc. interno s/similar','8':'Nac. >70% import.'};
var MODF={'0':'Emitente','1':'Destinatário','2':'Terceiros','3':'Próprio remetente','4':'Próprio destinatário','9':'Sem frete'};
var INDP={'0':'Não se aplica','1':'Presencial','2':'Internet','3':'Teleatendimento','4':'Entrega em domicílio','5':'Presencial fora do est.','9':'Outros'};
function T(sc,path){var el=sc;for(var i=0;i<path.length;i++){el=el&&el.children?([].slice.call(el.children).find(function(c){return c.tagName===path[i]})):null;}return el?el.textContent:'';}
function all(sc,tag){return sc?[].slice.call(sc.children).filter(function(c){return c.tagName===tag}):[];}
try{
  var doc=new DOMParser().parseFromString(xml,'application/xml');
  var inf=doc.querySelector('infNFe')||doc.querySelector('* infNFe');
  if(!inf){app.innerHTML='<div class="err">XML não é uma NF-e (infNFe não encontrado).</div>';throw 0;}
  var ide=inf.querySelector('ide'),emit=inf.querySelector('emit'),dest=inf.querySelector('dest');
  var ee=emit&&emit.querySelector('enderEmit'),ed=dest&&dest.querySelector('enderDest');
  var tot=inf.querySelector('ICMSTot'),transp=inf.querySelector('transp'),transa=transp&&transp.querySelector('transporta');
  var vol=transp&&transp.querySelector('vol'),cobr=inf.querySelector('cobr');
  var prot=doc.querySelector('protNFe'),infAdic=inf.querySelector('infAdic');
  var mod=String(T(ide,['mod'])||''),isNfce=mod==='65';
  var html='';
  // ===== Cabeçalho DANFE =====
  html+='<div class="head"><div class="emit">'+
    '<div class="nome">'+esc(T(emit,['xNome']))+'</div>'+
    '<div>'+ender({xLgr:T(ee,['xLgr']),nro:T(ee,['nro']),xCpl:T(ee,['xCpl']),xBairro:T(ee,['xBairro']),xMun:T(ee,['xMun']),UF:T(ee,['UF']),CEP:T(ee,['CEP'])})+'</div>'+
    '<div>Fone: '+esc(T(ee,['fone'])||'—')+'</div></div>'+
    '<div class="danfe"><div class="t">'+(isNfce?'DANFE NFC-e':'DANFE')+'</div>'+
    '<div>'+(isNfce?'Nota Fiscal Eletrônica do Consumidor':'Documento Auxiliar da NF-e')+'</div>'+
    '<div style="margin-top:4px"><b>Nº '+esc(T(ide,['nNF']))+'</b> · Série '+esc(T(ide,['serie']))+'</div>'+
    '<div>Emissão: '+d(T(ide,['dhEmi'])||T(ide,['dEmi']))+'</div>'+
    '<div>Saída/Entrada: '+d(T(ide,['dhSaiEnt'])||T(ide,['dSaiEnt']))+'</div></div></div>';
  html+='<div class="chave">CHAVE DE ACESSO: '+esc((inf.getAttribute('Id')||'').replace(/^NFe/,'').replace(/(\\d{4})/g,'$1 ').trim())+'</div>';
  // ===== Identificação =====
  html+='<div class="box"><div class="row">'+
    '<div class="cell" style="flex:2.4"><span class="lbl">Natureza da operação</span><span class="val">'+esc(T(ide,['natOp']))+'</span></div>'+
    '<div class="cell"><span class="lbl">Modelo</span><span class="val">'+esc(T(ide,['mod']))+'</span></div>'+
    '<div class="cell"><span class="lbl">Tipo operação</span><span class="val">'+(T(ide,['tpNF'])==='1'?'Saída':'Entrada')+'</span></div>'+
    '<div class="cell"><span class="lbl">Presença</span><span class="val">'+esc(INDP[T(ide,['indPres'])]||T(ide,['indPres'])||'—')+'</span></div>'+
    '<div class="cell"><span class="lbl">Protocolo</span><span class="val">'+esc(T(prot,['nProt'])||'—')+'</span></div></div></div>';
  // ===== Emitente =====
  html+='<div class="sec">Emitente</div><div class="box"><div class="row">'+
    '<div class="cell" style="flex:3"><span class="lbl">Nome / Razão social</span><span class="val"><b>'+esc(T(emit,['xNome']))+'</b></span></div>'+
    '<div class="cell"><span class="lbl">CNPJ/CPF</span><span class="val">'+cnpj(T(emit,['CNPJ'])||T(emit,['CPF']))+'</span></div>'+
    '<div class="cell"><span class="lbl">Inscrição Estadual</span><span class="val">'+esc(T(emit,['IE'])||'—')+'</span></div></div>'+
    '<div class="row"><div class="cell"><span class="lbl">Endereço</span><span class="val">'+ender({xLgr:T(ee,['xLgr']),nro:T(ee,['nro']),xCpl:T(ee,['xCpl']),xBairro:T(ee,['xBairro']),xMun:T(ee,['xMun']),UF:T(ee,['UF']),CEP:T(ee,['CEP'])})+'</span></div>'+
    '<div class="cell"><span class="lbl">CRT</span><span class="val">'+esc({'1':'Simples','2':'Simples exc.','3':'Normal','4':'MEI'}[T(emit,['CRT'])]||T(emit,['CRT'])||'—')+'</span></div></div></div>';
  // ===== Destinatário =====
  if(dest){
    html+='<div class="sec">Destinatário / Remetente</div><div class="box"><div class="row">'+
      '<div class="cell" style="flex:3"><span class="lbl">Nome / Razão social</span><span class="val"><b>'+esc(T(dest,['xNome']))+'</b></span></div>'+
      '<div class="cell"><span class="lbl">CNPJ/CPF</span><span class="val">'+cnpj(T(dest,['CNPJ'])||T(dest,['CPF']))+'</span></div>'+
      '<div class="cell"><span class="lbl">Inscrição Estadual</span><span class="val">'+esc(T(dest,['IE'])||'—')+'</span></div></div>'+
      '<div class="row"><div class="cell"><span class="lbl">Endereço</span><span class="val">'+ender({xLgr:T(ed,['xLgr']),nro:T(ed,['nro']),xCpl:T(ed,['xCpl']),xBairro:T(ed,['xBairro']),xMun:T(ed,['xMun']),UF:T(ed,['UF']),CEP:T(ed,['CEP'])})+'</span></div>'+
      '<div class="cell"><span class="lbl">Fone</span><span class="val">'+esc(T(ed,['fone'])||'—')+'</span></div></div></div>';
  }
  // ===== Fatura / Duplicatas =====
  var dups=cobr?all(cobr,'dup'):[];
  var fat=cobr&&cobr.querySelector('fat');
  if(fat||dups.length){
    html+='<div class="sec">Fatura / Duplicatas</div><div class="box"><table><thead><tr><th>Nº</th><th>Vencimento</th><th class="r">Valor</th></tr></thead><tbody>';
    if(fat)html+='<tr><td>Fatura '+esc(T(fat,['nFat'])||'')+'</td><td>—</td><td class="r">'+fmt(T(fat,['vLiq']))+'</td></tr>';
    for(var i=0;i<dups.length;i++)html+='<tr><td>'+esc(T(dups[i],['nDup'])||String(i+1))+'</td><td>'+d(T(dups[i],['dVenc']))+'</td><td class="r">'+fmt(T(dups[i],['vDup']))+'</td></tr>';
    html+='</tbody></table></div>';
  }
  // ===== Impostos totais =====
  if(tot){
    html+='<div class="sec">Cálculo do Imposto</div><div class="box" style="overflow-x:auto"><table class="tot"><thead><tr>'+
      '<th class="r">BC ICMS</th><th class="r">V. ICMS</th><th class="r">BC ICMS-ST</th><th class="r">V. ICMS-ST</th><th class="r">V. Produtos</th><th class="r">V. Frete</th><th class="r">V. Seguro</th><th class="r">V. Desconto</th><th class="r">Outras Desp.</th><th class="r">V. IPI</th><th class="r">V. II</th><th class="r">V. PIS</th><th class="r">V. COFINS</th><th class="r">V. TOTAL NF</th>'+
      '</tr></thead><tbody><tr>'+
      '<td class="r">'+fmt(T(tot,['vBC']))+'</td><td class="r">'+fmt(T(tot,['vICMS']))+'</td><td class="r">'+fmt(T(tot,['vBCST']))+'</td><td class="r">'+fmt(T(tot,['vST']))+
      '</td><td class="r">'+fmt(T(tot,['vProd']))+'</td><td class="r">'+fmt(T(tot,['vFrete']))+'</td><td class="r">'+fmt(T(tot,['vSeg']))+'</td><td class="r">'+fmt(T(tot,['vDesc']))+
      '</td><td class="r">'+fmt(T(tot,['vOutro']))+'</td><td class="r">'+fmt(T(tot,['vIPI']))+'</td><td class="r">'+fmt(T(tot,['vII']))+'</td><td class="r">'+fmt(T(tot,['vPIS']))+
      '</td><td class="r">'+fmt(T(tot,['vCOFINS']))+'</td><td class="r"><b>'+fmt(T(tot,['vNF']))+'</b></td></tr></tbody></table></div>';
  }
  // ===== Transporte =====
  if(transp){
    html+='<div class="sec">Transportador / Volumes</div><div class="box"><div class="row">'+
      '<div class="cell" style="flex:3"><span class="lbl">Transportadora</span><span class="val">'+esc(T(transa,['xNome'])||'—')+'</span></div>'+
      '<div class="cell"><span class="lbl">Mod. frete</span><span class="val">'+esc(MODF[T(transp,['modFrete'])]||T(transp,['modFrete'])||'—')+'</span></div>'+
      '<div class="cell"><span class="lbl">CNPJ/CPF</span><span class="val">'+cnpj(T(transa,['CNPJ'])||T(transa,['CPF'])||'')+'</span></div>'+
      '<div class="cell"><span class="lbl">UF</span><span class="val">'+esc(T(transa,['UF'])||'—')+'</span></div></div>'+
      (vol?'<div class="row"><div class="cell"><span class="lbl">Quantidade / Espécie</span><span class="val">'+esc(T(vol,['qVol'])+' '+T(vol,['esp']))+'</span></div>'+
      '<div class="cell"><span class="lbl">Peso bruto</span><span class="val">'+fmt4(T(vol,['pesoB']))+' kg</span></div>'+
      '<div class="cell"><span class="lbl">Peso líquido</span><span class="val">'+fmt4(T(vol,['pesoL']))+' kg</span></div></div>':'')+'</div>';
  }
  // ===== Itens =====
  html+='<div class="sec">Dados dos Produtos / Serviços</div><div class="box" style="overflow-x:auto"><table><thead><tr>'+
    '<th>#</th><th>Código</th><th>Descrição</th><th>NCM</th><th class="c">Orig/CST</th><th class="c">CFOP</th><th class="c">Un</th><th class="r">Qtd</th><th class="r">V.Unit</th><th class="r">V.Desc</th><th class="r">V.Total</th><th class="r">BC ICMS</th><th class="r">V.ICMS</th><th class="r">%ICMS</th><th class="r">BC-ST</th><th class="r">V.ST</th><th class="r">V.IPI</th><th class="r">%IPI</th><th class="r">V.PIS</th><th class="r">V.COFINS</th>'+
    '</tr></thead><tbody>';
  var dets=all(inf,'det');
  for(var i=0;i<dets.length;i++){
    var det=dets[i],prod=det.querySelector('prod'),imp=det.querySelector('imposto');
    var icmsG=imp&&imp.querySelector('ICMS'),icms=icmsG&&icmsG.children[0];
    var ipiG=imp&&imp.querySelector('IPI'),ipi=ipiG&&(ipiG.querySelector('IPITrib')||ipiG.children[0]);
    var pisG=imp&&imp.querySelector('PIS'),pis=pisG&&pisG.children[0];
    var cofG=imp&&imp.querySelector('COFINS'),cof=cofG&&cofG.children[0];
    var orig=T(icms,['orig']),cst=T(icms,['CST'])||T(icms,['CSOSN']);
    html+='<tr><td>'+esc(det.getAttribute('nItem')||String(i+1))+'</td>'+
      '<td>'+esc(T(prod,['cProd']))+'</td>'+
      '<td>'+esc(T(prod,['xProd']))+'</td>'+
      '<td>'+esc(T(prod,['NCM']))+'</td>'+
      '<td class="c" title="'+esc(ORIG[orig]||'')+'">'+esc(orig+cst)+'</td>'+
      '<td class="c">'+esc(T(prod,['CFOP']))+'</td>'+
      '<td class="c">'+esc(T(prod,['uCom']))+'</td>'+
      '<td class="r">'+fmt4(T(prod,['qCom']))+'</td>'+
      '<td class="r">'+fmt(T(prod,['vUnCom']))+'</td>'+
      '<td class="r">'+fmt(T(prod,['vDesc']))+'</td>'+
      '<td class="r"><b>'+fmt(T(prod,['vProd']))+'</b></td>'+
      '<td class="r">'+fmt(T(icms,['vBC']))+'</td>'+
      '<td class="r">'+fmt(T(icms,['vICMS']))+'</td>'+
      '<td class="r">'+fmt(T(icms,['pICMS']))+'</td>'+
      '<td class="r">'+fmt(T(icms,['vBCST']))+'</td>'+
      '<td class="r">'+fmt(T(icms,['vICMSST']))+'</td>'+
      '<td class="r">'+fmt(T(ipi,['vIPI']))+'</td>'+
      '<td class="r">'+fmt(T(ipi,['pIPI']))+'</td>'+
      '<td class="r">'+fmt(T(pis,['vPIS']))+'</td>'+
      '<td class="r">'+fmt(T(cof,['vCOFINS']))+'</td></tr>';
  }
  html+='</tbody></table></div>';
  // ===== Inf. adicionais =====
  var infCpl=T(infAdic,['infCpl']),infFisco=T(infAdic,['infAdFisco']);
  if(infCpl||infFisco){
    html+='<div class="sec">Dados Adicionais</div><div class="box" style="padding:5px 7px;font-size:10px;white-space:pre-wrap">'+
      (infFisco?'<b>Fisco:</b> '+esc(infFisco)+'\\n':'')+esc(infCpl)+'</div>';
  }
  // ===== Rodapé =====
  html+='<div class="foot"><span>'+
    (prot?'Protocolo '+esc(T(prot,['nProt']))+' · '+dh(T(prot,['dhRecbto'])):'')+'</span><span class="muted">Renderizado por Aery Fiscal</span></div>';
  app.innerHTML=html;
}catch(e){if(e!==0)app.innerHTML='<div class="err">Erro ao interpretar o XML: '+esc(e&&e.message)+'</div>';}
</scr` + `ipt>
</body>
</html>`;
}
