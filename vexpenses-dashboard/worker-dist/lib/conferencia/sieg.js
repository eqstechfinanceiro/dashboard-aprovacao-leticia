"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.garantirAutenticacao = garantirAutenticacao;
exports.preAdicionarChaves = preAdicionarChaves;
exports.baixarXmlSieg = baixarXmlSieg;
/**
 * SIEG — download de XML NF-e por chave de acesso.
 * Port de sieg_handler.py: cookies COFRE.AUTH persistidos em disco,
 * login Playwright headless como fallback, addKeys + downloadXmlLot + zip.
 */
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const zip_1 = require("./zip");
const SIEG_HUB_URL = 'https://hub.sieg.com/handler/hubInfo.ashx';
const SIEG_DOWNLOAD_URL = 'https://down.sieg.com/download.ashx';
const SIEG_AUTH_URL = 'https://auth.sieg.com';
const SIEG_HUB_HOME = 'https://hub.sieg.com/';
const CERTIFICATE_ID = process.env.SIEG_CERTIFICATE_ID || '29309-80464753000197';
const SIEG_EMAIL = process.env.SIEG_EMAIL || '';
const SIEG_SENHA = process.env.SIEG_SENHA || '';
const COOKIES_FILE = path_1.default.join(process.cwd(), 'private-downloads', 'sieg_cookies.json');
let cookies = null;
let cookiesLoaded = false;
function cookieHeader() {
    return Object.entries(cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
}
function httpPost(url, body, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
        const data = isForm ? body : body ? Buffer.from(body.toString()) : undefined;
        const req = https_1.default.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                Cookie: cookieHeader(),
                ...(isForm && data?.getHeaders ? data.getHeaders() : {}),
                ...(data && !isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            },
            timeout: timeoutMs,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf-8') }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        if (data)
            req.write(isForm && data.getBuffer ? data.getBuffer() : data);
        req.end();
    });
}
function httpPostMultipart(url, fields, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const boundary = '----sieg' + Date.now().toString(16);
        const parts = [];
        for (const [k, v] of Object.entries(fields)) {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
        }
        parts.push(Buffer.from(`--${boundary}--\r\n`));
        const data = Buffer.concat(parts);
        const req = https_1.default.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                Cookie: cookieHeader(),
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': data.length,
            },
            timeout: timeoutMs,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf-8') }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}
function httpGet(url, timeoutMs = 30000, hops = 0) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https_1.default.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { Cookie: cookieHeader() }, timeout: timeoutMs }, (res) => {
            // down.sieg.com redireciona (302) pro host real do zip — requests seguia
            // sozinho no Python; aqui seguimos manualmente até 5 hops.
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                if (hops >= 5)
                    return reject(new Error('redirects demais'));
                return resolve(httpGet(res.headers.location, timeoutMs, hops + 1));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.end();
    });
}
function carregarCookies() {
    if (cookiesLoaded)
        return !!cookies?.['COFRE.AUTH'];
    cookiesLoaded = true;
    try {
        const raw = JSON.parse((0, fs_1.readFileSync)(COOKIES_FILE, 'utf-8'));
        if (raw && raw['COFRE.AUTH']) {
            cookies = raw;
            return true;
        }
    }
    catch { }
    return false;
}
function salvarCookies() {
    try {
        (0, fs_1.mkdirSync)(path_1.default.dirname(COOKIES_FILE), { recursive: true });
        (0, fs_1.writeFileSync)(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    }
    catch (e) {
        console.warn('[sieg] falha ao salvar cookies:', e?.message);
    }
}
async function cookiesValidos() {
    if (!cookies?.['COFRE.AUTH'])
        return false;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await httpPost(`${SIEG_HUB_URL}?action=getInfoCompanyHub&cnpjOrCpf=`, undefined, 20000);
            const data = JSON.parse(r.text || 'null');
            if (r.status === 200 && data && !data.error)
                return true;
        }
        catch { }
        await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
}
/** Login via Playwright headless — retorna true se obteve COFRE.AUTH. */
async function fazerLogin() {
    if (!SIEG_EMAIL || !SIEG_SENHA) {
        console.warn('[sieg] SIEG_EMAIL/SIEG_SENHA não configurados');
        return false;
    }
    let browser = null;
    try {
        const { chromium } = await Promise.resolve().then(() => __importStar(require('playwright')));
        browser = await chromium.launch({ headless: true });
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(SIEG_AUTH_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.fill('#txtEmail', SIEG_EMAIL);
        await page.waitForTimeout(500);
        await page.fill('#txtPassword', SIEG_SENHA);
        await page.waitForTimeout(500);
        await page.click('#btnSubmit');
        await page.waitForURL(SIEG_HUB_HOME + '**', { timeout: 30000 });
        await page.waitForTimeout(2000);
        const list = await ctx.cookies();
        const found = {};
        for (const c of list)
            if (/sieg/.test(c.domain))
                found[c.name] = c.value;
        await ctx.close();
        if (!found['COFRE.AUTH']) {
            console.error('[sieg] login ok mas COFRE.AUTH ausente');
            return false;
        }
        cookies = found;
        cookiesLoaded = true;
        salvarCookies();
        console.log('[sieg] login ok (COFRE.AUTH renovado)');
        return true;
    }
    catch (e) {
        console.error('[sieg] login falhou:', e?.message);
        return false;
    }
    finally {
        try {
            await browser?.close();
        }
        catch { }
    }
}
async function garantirAutenticacao() {
    carregarCookies();
    if (await cookiesValidos())
        return true;
    return fazerLogin();
}
/** Pré-adiciona chaves ao SIEG em lotes (evita 10s por NF). */
async function preAdicionarChaves(chaves) {
    const validas = chaves.map((c) => c.trim()).filter((c) => c.length === 44 && /^\d+$/.test(c));
    let added = 0;
    for (let i = 0; i < validas.length; i += 50) {
        const batch = validas.slice(i, i + 50);
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const r = await httpPostMultipart(`${SIEG_HUB_URL}?action=addKeys&cnpjOrCpf=`, { certificateId: CERTIFICATE_ID, keys: batch.join(',') }, 60000);
                const j = JSON.parse(r.text || '{}');
                added += j.TotalSuccess || 0;
                break;
            }
            catch {
                await new Promise((r2) => setTimeout(r2, 3000));
            }
        }
    }
    if (added > 0)
        await new Promise((r) => setTimeout(r, 10000));
    return added;
}
async function adicionarChave(chave) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await httpPostMultipart(`${SIEG_HUB_URL}?action=addKeys&cnpjOrCpf=`, { certificateId: CERTIFICATE_ID, keys: chave }, 30000);
            return JSON.parse(r.text || '{}');
        }
        catch {
            await new Promise((r2) => setTimeout(r2, 3000));
        }
    }
    throw new Error(`addKeys falhou (3 tentativas) ${chave}`);
}
async function solicitarDownload(chave, tipoXml = 1) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await httpPostMultipart(`${SIEG_HUB_URL}?action=downloadXmlLot&cnpjOrCpf=`, { keysToDownload: `${chave}|${tipoXml}` }, 15000);
            const j = JSON.parse(r.text || '{}');
            if (!j.Success)
                throw new Error(`SIEG download: ${j.Message}`);
            return j.ZipKey;
        }
        catch (e) {
            if (attempt === 2)
                throw e;
            await new Promise((r2) => setTimeout(r2, 3000));
        }
    }
    throw new Error('downloadXmlLot falhou');
}
async function baixarZip(zipKey) {
    const [token, partsStr] = zipKey.split('|');
    const parts = parseInt(partsStr, 10);
    const all = [];
    for (let i = 1; i <= parts; i++) {
        let ok = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                all.push(await httpGet(`${SIEG_DOWNLOAD_URL}?zippart=${token}&part=${i}`, 30000));
                ok = true;
                break;
            }
            catch {
                await new Promise((r2) => setTimeout(r2, 3000));
            }
        }
        if (!ok)
            throw new Error(`baixar_zip falhou na parte ${i}`);
    }
    return Buffer.concat(all);
}
/**
 * Baixa o XML da NF-e pela chave. O Python chama pre_adicionar_chaves em lote
 * antes — dentro do retry, addKeys é dead code (só executaria com flags que
 * nunca sobem). Aqui: download direto com retries; quem precisa adicionar a
 * chave chama preAdicionarChaves no orquestrador.
 */
async function baixarXmlSieg(chaveAcesso, tipoXml = 1, maxRetries = 3) {
    const chave = chaveAcesso.trim();
    if (chave.length !== 44 || !/^\d+$/.test(chave))
        return null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const zipKey = await solicitarDownload(chave, tipoXml);
            const zipBuf = await baixarZip(zipKey);
            const entry = (0, zip_1.unzipFirstFile)(zipBuf);
            if (!entry) {
                await new Promise((r) => setTimeout(r, 3000));
                continue;
            }
            return entry.data.toString('utf-8');
        }
        catch (e) {
            console.warn(`[sieg] tentativa ${attempt + 1} falhou ${chave}:`, e?.message);
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    return null;
}
