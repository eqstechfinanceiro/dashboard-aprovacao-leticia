"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SP_SITES = void 0;
exports.getSpStatus = getSpStatus;
exports.ensureConnected = ensureConnected;
exports.listFolders = listFolders;
exports.listFiles = listFiles;
exports.downloadFile = downloadFile;
exports.ensureFolder = ensureFolder;
exports.uploadFile = uploadFile;
exports.fileExists = fileExists;
exports.closeSpBrowser = closeSpBrowser;
const playwright_1 = require("playwright");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const SITE_URL = 'https://eqsengenharia.sharepoint.com';
const SESSION_FILE = '.sharepoint_comprovantes_session.json';
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
exports.SP_SITES = {
    eqs: {
        sitePath: '/Financeiro',
        libraryRoot: '/Financeiro/Documentos Compartilhados',
        sourceBase: '/Financeiro/Documentos Compartilhados/Financeiro/Controle Financeiro/COMPROVANTES - DESMEMBRAR',
        sharingLinkUrl: `${SITE_URL}/Financeiro/Documentos%20Compartilhados/Forms/AllItems.aspx` +
            `?id=%2FFinanceiro%2FDocumentos%20Compartilhados%2FFinanceiro%2FControle%20Financeiro` +
            `%2FCOMPROVANTES%20%2D%20DESMEMBRAR` +
            `&viewid=c722c10d%2D5a9a%2D4b2f%2Dbf66%2D657c466771e1` +
            `&sharingv2=true&fromShare=true`,
    },
    bratec: {
        sitePath: '/teams/BRATECFINANCEIRO',
        libraryRoot: '/teams/BRATECFINANCEIRO/Documentos Compartilhados',
        sourceBase: '/teams/BRATECFINANCEIRO/Documentos Compartilhados/FINANCEIRO/COMPROVANTES - DESMEMBRAR',
        sharingLinkUrl: `${SITE_URL}/teams/BRATECFINANCEIRO/Documentos%20Compartilhados/Forms/AllItems.aspx` +
            `?id=%2Fteams%2FBRATECFINANCEIRO%2FDocumentos%20Compartilhados%2FFINANCEIRO` +
            `%2FCOMPROVANTES%20%2D%20DESMEMBRAR` +
            `&viewid=7772899d%2Dd437%2D4eae%2Da398%2Df9822e4d91dd` +
            `&sharingv2=true&fromShare=true`,
    },
    destino: {
        sitePath: '/comprovantes',
        libraryRoot: '/comprovantes/Documentos Compartilhados',
        sourceBase: '/comprovantes/Documentos Compartilhados',
        sharingLinkUrl: `${SITE_URL}/comprovantes/Documentos%20Compartilhados/Forms/AllItems.aspx` +
            `?viewid=4a277465%2D3b3d%2D4027%2D8bd5%2D63d7d0564836` +
            `&sharingv2=true&fromShare=true`,
    },
};
let browser = null;
let browserPid = null;
let browserProfileDir = null;
let context = null;
let page = null;
let status = 'disconnected';
let statusMessage = '';
let lastHealthCheck = 0;
let connectPromise = null;
function sessionPath() {
    return (0, path_1.join)(process.cwd(), SESSION_FILE);
}
function isOnAuthPage(url) {
    return url.includes('login.microsoftonline.com') || url.includes('login.live.com') || url.includes('AccessDenied.aspx');
}
function isOnSharePointPage(url) {
    return url.includes('sharepoint.com') && url.includes('AllItems');
}
function getSpStatus() {
    return { status, statusMessage, lastHealthCheck };
}
const CHROMIUM_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--disable-features=Translate,BackForwardCache',
    '--js-flags=--max-old-space-size=256',
];
// Browser ocioso fecha sozinho — RSS do chromium cresce com o tempo e, se o node
// morrer por OOM, o browser vira órfão. TTL rearmado a cada uso = ociosidade real.
const BROWSER_IDLE_TTL_MS = 30 * 60 * 1000;
let idleTimer = null;
function armIdleTimer() {
    if (idleTimer)
        clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        if (browser) {
            console.log('[comprovantes-sp] fechando browser ocioso (TTL 30min)');
            void closeSpBrowser();
        }
    }, BROWSER_IDLE_TTL_MS);
    if (typeof idleTimer.unref === 'function')
        idleTimer.unref();
}
/**
 * PID do processo chrome filho deste node + o --user-data-dir da sessão.
 * O dir é único por launch e presente na cmdline de TODOS os subprocessos
 * (renderers, gpu, utility) — permite matar a árvore inteira mesmo depois
 * que os filhos foram reparentados pro init quando o pai crashou.
 */
function captureBrowserSession() {
    try {
        const out = (0, child_process_1.execSync)(`pgrep -P ${process.pid} -f 'user-data-dir=/tmp/playwright' | head -1`, { timeout: 5000 }).toString().trim();
        const pid = parseInt(out, 10);
        if (!(pid > 0))
            return { pid: null, dir: null };
        const args = (0, child_process_1.execSync)(`ps -o args= -p ${pid}`, { timeout: 5000 }).toString();
        const dir = /--user-data-dir=(\S+)/.exec(args)?.[1] ?? null;
        return { pid, dir };
    }
    catch {
        return { pid: null, dir: null };
    } // sem pgrep (Windows dev)
}
function killSessionTree(pid, dir) {
    if (dir) {
        try {
            (0, child_process_1.execSync)(`pkill -KILL -f '${dir}' || true`, { timeout: 5000, stdio: 'ignore' });
            return;
        }
        catch { /* sem pkill */ }
    }
    if (pid) {
        try {
            process.kill(pid, 'SIGKILL');
        }
        catch { /* já morto */ }
    }
}
/**
 * Fecha o browser com timeout — close() em browser zumbi pode pendurar pra
 * sempre; depois de 8s mata a sessão inteira pelo --user-data-dir.
 */
async function forceClose(b, pid, dir) {
    if (!b && !pid && !dir)
        return;
    try {
        await Promise.race([
            b ? b.close().catch(() => { }) : Promise.resolve(),
            new Promise((r) => setTimeout(r, 8000)),
        ]);
    }
    catch { /* ignore */ }
    killSessionTree(pid, dir);
}
let exitHookArmed = false;
function armExitHook() {
    if (exitHookArmed)
        return;
    exitHookArmed = true;
    // 'exit' não permite async — pkill síncrono na sessão inteira
    const kill = () => { try {
        killSessionTree(browserPid, browserProfileDir);
    }
    catch { /* ignore */ } };
    process.once('exit', kill);
    process.once('SIGTERM', kill);
    process.once('SIGINT', kill);
}
const CRASH_RE = /target crashed|target closed|has been closed|browser has been closed|session closed|connection closed/i;
function isCrashError(err) {
    return CRASH_RE.test(String(err?.message || err));
}
function markDisconnected(msg, b, pid, dir) {
    status = 'disconnected';
    statusMessage = msg;
    // A conexão caiu mas o processo chrome pode continuar vivo (websocket morto,
    // contexto fechado) — sem fechar aqui, cada reconexão empilha um órfão
    browser = null;
    browserPid = null;
    browserProfileDir = null;
    context = null;
    page = null;
    if (b || pid)
        void forceClose(b, pid, dir);
}
// Registra handlers para detectar crash do browser/página fora de chamadas.
// CRÍTICO: cada handler captura a PRÓPRIA sessão (b/c/p) e só age se ela ainda
// for a corrente — eventos de um browser antigo podem disparar depois que um
// novo já foi lançado, e sem a checagem eles fechavam o browser novo no meio
// do goto (era o loop de crashes + browsers órfãos acumulando).
function wireCrashWatch(b, c, p) {
    try {
        const gone = (msg) => {
            if (browser !== b)
                return; // evento de sessão antiga — o browser global já é outro
            markDisconnected(msg, b, browserPid, browserProfileDir);
        };
        p.on('crash', () => gone('página do browser crashou (OOM/shm)'));
        p.on('close', () => { if (status === 'connected')
            gone('página fechada'); });
        c.on('close', () => { if (status === 'connected')
            gone('contexto fechado'); });
        b.on('disconnected', () => gone('browser desconectou'));
    }
    catch { /* ignore */ }
}
async function cleanup() {
    const b = browser;
    const pid = browserPid;
    const dir = browserProfileDir;
    browser = null;
    browserPid = null;
    browserProfileDir = null;
    context = null;
    page = null;
    await forceClose(b, pid, dir);
}
// Executa fn() e, se o browser crashar no meio, derruba tudo, reconecta e tenta
// UMA vez mais — uma falha transitória não deve virar erro permanente pro usuário
async function withCrashRetry(site, fn) {
    try {
        return await fn();
    }
    catch (err) {
        if (!isCrashError(err))
            throw err;
        console.error('[comprovantes-sp] browser crash — reconectando e retentando:', String(err?.message || err).slice(0, 200));
        status = 'disconnected';
        await cleanup();
        await ensureConnected(site);
        return await fn();
    }
}
async function tryRestoreSession(site) {
    try {
        browser = await playwright_1.chromium.launch({ headless: true, args: CHROMIUM_ARGS });
        const sess = captureBrowserSession();
        browserPid = sess.pid;
        browserProfileDir = sess.dir;
        context = await browser.newContext({ storageState: sessionPath(), acceptDownloads: true });
        page = await context.newPage();
        wireCrashWatch(browser, context, page);
        armIdleTimer();
        armExitHook();
        await page.goto(site.sharingLinkUrl, { timeout: 60000 });
        await page.waitForTimeout(3000);
        const url = page.url();
        if (isOnSharePointPage(url))
            return true;
        if (isOnAuthPage(url))
            return false;
        try {
            const text = await page.content();
            if (text.includes('Documentos') && text.includes('AllItems'))
                return true;
        }
        catch { /* ignore */ }
        return false;
    }
    catch (err) {
        console.error('[comprovantes-sp] session restore failed:', err);
        return false;
    }
}
async function autoLogin(site) {
    const email = process.env.SHAREPOINT_EMAIL;
    const password = process.env.SHAREPOINT_PASSWORD;
    if (!email || !password) {
        statusMessage = 'SHAREPOINT_EMAIL/SHAREPOINT_PASSWORD não configurados';
        return false;
    }
    await cleanup();
    browser = await playwright_1.chromium.launch({ headless: true, args: CHROMIUM_ARGS });
    const sess = captureBrowserSession();
    browserPid = sess.pid;
    browserProfileDir = sess.dir;
    context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    page = await context.newPage();
    wireCrashWatch(browser, context, page);
    armIdleTimer();
    armExitHook();
    await page.goto(site.sharingLinkUrl, { timeout: 60000 });
    await page.waitForTimeout(2000);
    if (isOnSharePointPage(page.url()))
        return true;
    if (!isOnAuthPage(page.url())) {
        await page.waitForTimeout(3000);
        if (isOnSharePointPage(page.url()))
            return true;
    }
    try {
        await page.waitForSelector('input[type="email"], input[name="loginfmt"]', { timeout: 15000 });
        await page.fill('input[type="email"], input[name="loginfmt"]', email);
        await page.click('input[type="submit"], button[type="submit"]');
        await page.waitForTimeout(3000);
        await page.waitForSelector('input[type="password"], input[name="passwd"]', { timeout: 15000 });
        await page.fill('input[type="password"], input[name="passwd"]', password);
        await page.click('input[type="submit"], button[type="submit"]');
        await page.waitForTimeout(5000);
        if (isOnAuthPage(page.url())) {
            try {
                await page.waitForSelector('input[type="submit"][value="Yes"], input[type="submit"][value="Sim"], button:has-text("Yes"), button:has-text("Sim")', { timeout: 10000 });
                await page.click('input[type="submit"][value="Yes"], input[type="submit"][value="Sim"], button:has-text("Yes"), button:has-text("Sim")');
                await page.waitForTimeout(3000);
            }
            catch { /* no prompt */ }
        }
        const start = Date.now();
        while (Date.now() - start < 60000) {
            await page.waitForTimeout(2000);
            if (isOnSharePointPage(page.url()))
                return true;
            if (page.url().includes('AccessDenied'))
                break;
        }
        await cleanup(); // login falhou — não deixar chromium aberto sem uso
        return false;
    }
    catch (err) {
        console.error('[comprovantes-sp] auto-login error:', err);
        statusMessage = `auto-login falhou: ${err instanceof Error ? err.message : err}`;
        await cleanup();
        return false;
    }
}
async function ensureConnected(site) {
    if (status === 'connected' && page && !page.isClosed() && Date.now() - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
        armIdleTimer(); // uso ativo = rearmar TTL de ociosidade
        return;
    }
    if (!connectPromise) {
        connectPromise = (async () => {
            status = 'connecting';
            statusMessage = '';
            try {
                if ((0, fs_1.existsSync)(sessionPath())) {
                    if (await tryRestoreSession(site)) {
                        status = 'connected';
                        lastHealthCheck = Date.now();
                        return true;
                    }
                    await cleanup();
                }
                const ok = await autoLogin(site);
                if (ok) {
                    await context.storageState({ path: sessionPath() });
                    status = 'connected';
                    lastHealthCheck = Date.now();
                }
                else {
                    status = 'error';
                    if (!statusMessage)
                        statusMessage = 'Login falhou — pode ser necessário login interativo (VNC)';
                }
                return ok;
            }
            catch (err) {
                status = 'error';
                statusMessage = String(err);
                return false;
            }
            finally {
                connectPromise = null;
            }
        })();
    }
    const ok = await connectPromise;
    if (!ok || !page)
        throw new Error(`SharePoint não conectado: ${statusMessage || status}`);
}
async function apiGet(site, endpoint) {
    await ensureConnected(site);
    const url = `${SITE_URL}${site.sitePath}/_api/${endpoint}`;
    const result = await page.evaluate(async (u) => {
        const resp = await fetch(u, { headers: { Accept: 'application/json;odata=nometadata' } });
        if (!resp.ok)
            return { __error: resp.status, __body: (await resp.text()).substring(0, 300) };
        return await resp.json();
    }, url);
    if (result?.__error) {
        if ((result.__error === 400 || result.__error === 401 || result.__error === 403) && status === 'connected') {
            status = 'expired';
            await ensureConnected(site);
            const retry = await page.evaluate(async (u) => {
                const resp = await fetch(u, { headers: { Accept: 'application/json;odata=nometadata' } });
                if (!resp.ok)
                    return { __error: resp.status, __body: (await resp.text()).substring(0, 300) };
                return await resp.json();
            }, url);
            if (retry?.__error)
                throw new Error(`SharePoint API ${retry.__error}: ${retry.__body}`);
            return retry;
        }
        throw new Error(`SharePoint API ${result.__error}: ${result.__body}`);
    }
    return result;
}
async function getFormDigest(site) {
    await ensureConnected(site);
    const url = `${SITE_URL}${site.sitePath}/_api/contextinfo`;
    const result = await page.evaluate(async (u) => {
        const resp = await fetch(u, { method: 'POST', headers: { Accept: 'application/json;odata=nometadata' } });
        if (!resp.ok)
            throw new Error(`contextinfo ${resp.status}`);
        return await resp.json();
    }, url);
    return result.FormDigestValue || '';
}
function esc(path) {
    return path.replace(/'/g, "''");
}
async function listFolders(site, folderPath) {
    return withCrashRetry(site, async () => {
        const p = folderPath.startsWith('/') ? folderPath : `${site.libraryRoot}/${folderPath}`;
        try {
            const result = await apiGet(site, `web/GetFolderByServerRelativeUrl('${esc(p)}')/Folders`);
            return (result.value ?? []).map((f) => String(f.Name));
        }
        catch (err) {
            if (String(err).includes('404'))
                return [];
            throw err;
        }
    });
}
async function listFiles(site, folderPath) {
    return withCrashRetry(site, async () => {
        const p = folderPath.startsWith('/') ? folderPath : `${site.libraryRoot}/${folderPath}`;
        try {
            const result = await apiGet(site, `web/GetFolderByServerRelativeUrl('${esc(p)}')/Files`);
            return (result.value ?? []).map((f) => ({
                name: String(f.Name ?? ''),
                size: Number(f.Length ?? 0),
                url: String(f.ServerRelativeUrl ?? ''),
                timeLastModified: f.TimeLastModified ? String(f.TimeLastModified) : null,
            }));
        }
        catch (err) {
            if (String(err).includes('404'))
                return [];
            throw err;
        }
    });
}
async function downloadFile(serverRelativeUrl, site) {
    const s = site || exports.SP_SITES.eqs;
    return withCrashRetry(s, async () => {
        await ensureConnected(s);
        const downloadUrl = serverRelativeUrl.startsWith('http') ? serverRelativeUrl : `${SITE_URL}${serverRelativeUrl}`;
        const b64 = await page.evaluate(async (url) => {
            const resp = await fetch(url);
            if (!resp.ok)
                throw new Error(`Download ${resp.status}`);
            const buffer = await resp.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunk = 8192;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
            }
            return btoa(binary);
        }, downloadUrl);
        return Buffer.from(b64, 'base64');
    });
}
async function ensureFolder(site, folderPath) {
    return withCrashRetry(site, () => ensureFolderInner(site, folderPath));
}
async function ensureFolderInner(site, folderPath) {
    const full = folderPath.startsWith('/') ? folderPath : `${site.libraryRoot}/${folderPath}`;
    const rootParts = site.libraryRoot.replace(/^\/+|\/+$/g, '').split('/');
    const allParts = full.replace(/^\/+|\/+$/g, '').split('/');
    // A sessão entra por link de compartilhamento com acesso à biblioteca, não à
    // raiz do site — caminhar desde '/' falha no 1º segmento (raiz nega acesso e
    // o fallback tenta criar a pasta-raiz → 403). Começa do libraryRoot.
    const underRoot = rootParts.every((rp, i) => allParts[i] === rp);
    let current = underRoot ? `/${rootParts.join('/')}` : '';
    const relParts = underRoot ? allParts.slice(rootParts.length) : allParts;
    for (const part of relParts) {
        current = `${current}/${part}`;
        try {
            await apiGet(site, `web/GetFolderByServerRelativeUrl('${esc(current)}')`);
        }
        catch {
            const parent = current.substring(0, current.lastIndexOf('/'));
            const name = current.substring(current.lastIndexOf('/') + 1);
            const digest = await getFormDigest(site);
            await ensureConnected(site);
            const url = `${SITE_URL}${site.sitePath}/_api/web/GetFolderByServerRelativeUrl('${esc(parent)}')/Folders/add('${esc(name)}')`;
            const res = await page.evaluate(async ({ u, d }) => {
                const resp = await fetch(u, {
                    method: 'POST',
                    headers: { Accept: 'application/json;odata=nometadata', 'X-RequestDigest': d },
                });
                if (!resp.ok)
                    return `ERR ${resp.status}: ${(await resp.text()).substring(0, 200)}`;
                return 'ok';
            }, { u: url, d: digest });
            if (res !== 'ok')
                throw new Error(`Falha ao criar pasta ${current}: ${res}`);
        }
    }
}
async function uploadFile(site, folderPath, fileName, content) {
    return withCrashRetry(site, () => uploadFileInner(site, folderPath, fileName, content));
}
async function uploadFileInner(site, folderPath, fileName, content) {
    await ensureFolder(site, folderPath);
    const fullPath = folderPath.startsWith('/') ? folderPath : `${site.libraryRoot}/${folderPath}`;
    if (content.length >= 4 * 1024 * 1024)
        throw new Error('Arquivo > 4MB — upload em chunk não implementado');
    const digest = await getFormDigest(site);
    await ensureConnected(site);
    const url = `${SITE_URL}${site.sitePath}/_api/web/GetFolderByServerRelativeUrl('${esc(fullPath)}')`;
    const contentB64 = content.toString('base64');
    const res = await page.evaluate(async ({ u, f, c, d }) => {
        const binary = atob(c);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
        const resp = await fetch(`${u}/Files/add(url='${f}', overwrite=true)`, {
            method: 'POST',
            headers: { Accept: 'application/json;odata=nometadata', 'X-RequestDigest': d },
            body: bytes,
        });
        if (!resp.ok)
            return `ERR ${resp.status}: ${(await resp.text()).substring(0, 200)}`;
        return 'ok';
    }, { u: url, f: fileName, c: contentB64, d: digest });
    if (res !== 'ok')
        throw new Error(`Upload falhou ${fileName}: ${res}`);
}
async function fileExists(site, filePath) {
    const p = filePath.startsWith('/') ? filePath : `${site.libraryRoot}/${filePath}`;
    try {
        await withCrashRetry(site, () => apiGet(site, `web/GetFileByServerRelativeUrl('${esc(p)}')`));
        return true;
    }
    catch {
        return false;
    }
}
async function closeSpBrowser() {
    await cleanup();
    status = 'disconnected';
}
