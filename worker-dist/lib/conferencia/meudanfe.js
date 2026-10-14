"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meudanfeEnabled = meudanfeEnabled;
exports.baixarXmlMeudanfe = baixarXmlMeudanfe;
/**
 * MeuDanfe API v2 — fonte de XML 100% gratuita (somente leitura).
 *
 * Usa apenas GET /fd/get/xml/{chave}: GRÁTIS para qualquer NF-e que já esteja
 * na Área do Cliente da conta (buscadas anteriormente ou baixadas
 * automaticamente pelo certificado A1 cadastrado lá).
 *
 * O endpoint pago (PUT /fd/add/{chave}, R$0,03/consulta) NÃO é usado —
 * a conta não tem créditos e a política é zero custo.
 *
 * Config: MEUDANFE_API_KEY no .env.local da VPS.
 */
const BASE = (process.env.MEUDANFE_API_BASE || 'https://api.meudanfe.com.br/v2').replace(/\/$/, '');
function meudanfeEnabled() {
    return !!(process.env.MEUDANFE_API_KEY || '').trim();
}
/**
 * Baixa o XML da NF-e pela chave de acesso, se ela já existir no repositório
 * da conta. Retorna o XML ou null (404 = não está no repo / sem custo algum).
 * Nunca lança exceção — falha de provider não pode derrubar o ciclo.
 */
async function baixarXmlMeudanfe(chaveAcesso) {
    const key = (process.env.MEUDANFE_API_KEY || '').trim();
    const chave = (chaveAcesso || '').trim();
    if (!key || !/^\d{44}$/.test(chave))
        return null;
    try {
        const res = await fetch(`${BASE}/fd/get/xml/${chave}`, {
            method: 'GET',
            headers: { 'Api-Key': key, Accept: 'application/json' },
            signal: AbortSignal.timeout(30000),
        });
        if (res.status === 404)
            return null;
        if (!res.ok) {
            console.warn(`[meudanfe] get/xml ${chave.slice(0, 10)}… → HTTP ${res.status}`);
            return null;
        }
        const body = await res.json().catch(() => null);
        const xml = body?.data;
        if (typeof xml === 'string' && xml.includes('<'))
            return xml;
        return null;
    }
    catch (e) {
        console.warn(`[meudanfe] get/xml ${chave.slice(0, 10)}… falhou:`, e?.message);
        return null;
    }
}
