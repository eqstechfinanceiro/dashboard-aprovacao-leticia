import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import tls from 'tls';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Vários certificados A1 convivem: private-downloads/sefaz/{rotulo}.pfx +
// {rotulo}.pass + meta.json com a lista. O rótulo é a chave que as integrações
// (SEFAZ distDFe etc.) usam pra escolher qual certificado autenticar.
const DIR = path.join(process.cwd(), 'private-downloads', 'sefaz');
const META_PATH = path.join(DIR, 'certificados.json');
const MAX_PFX_BYTES = 1 * 1024 * 1024;

// Quem pode instalar certificados: lista fechada de emails (env).
// Sem a env configurada, NINGUÉM acessa — fail-closed proposital.
function allowedEmails(): string[] {
  return (process.env.SEFAZ_CERT_ALLOWED_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
function isAllowed(request: NextRequest): boolean {
  const email = (request.headers.get('x-user-email') || '').toLowerCase();
  return !!email && allowedEmails().includes(email);
}

function readMeta(): Record<string, Record<string, unknown>> {
  try { return JSON.parse(readFileSync(META_PATH, 'utf-8')); } catch { return {}; }
}
function writeMeta(m: Record<string, Record<string, unknown>>) {
  writeFileSync(META_PATH, JSON.stringify(m, null, 2), { mode: 0o600 });
  chmodSync(META_PATH, 0o600);
}

// Extrai subject/validade do .pfx via openssl (best-effort — se falhar,
// o certificado ainda está válido, só não mostramos os metadados).
function pfxInfo(pfxPath: string, pass: string): { subject?: string; validade?: string } {
  try {
    const out = execFileSync(
      'openssl',
      ['pkcs12', '-in', pfxPath, '-clcerts', '-nokeys', '-passin', `pass:${pass}`],
      { timeout: 15000 }
    ).toString('utf-8');
    const subject = /subject=?\s*(.+)/.exec(out)?.[1]?.trim();
    const notAfter = /notAfter=(.+)/.exec(out)?.[1]?.trim();
    return { subject, validade: notAfter };
  } catch {
    return {};
  }
}

// GET — lista certificados instalados (status + metadados). Nunca expõe arquivos.
export async function GET(request: NextRequest) {
  if (!isAllowed(request)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const meta = readMeta();
  const items = Object.entries(meta)
    .filter(([slug]) => existsSync(path.join(DIR, `${slug}.pfx`)))
    .map(([slug, m]) => ({ slug, ...m }));
  return NextResponse.json({ certificados: items });
}

// POST multipart: file (.pfx/.p12) + senha + rotulo (ex.: "eqs", "bratec").
// Valida que a senha abre o certificado antes de gravar.
export async function POST(request: NextRequest) {
  if (!isAllowed(request)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const form = await request.formData();
  const file = form.get('file');
  const senha = String(form.get('senha') || '');
  const rotulo = String(form.get('rotulo') || '').trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(rotulo)) {
    return NextResponse.json({ error: 'Informe um rótulo (ex.: eqs, bratec) — letras minúsculas, números e hífen' }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 });
  if (!senha) return NextResponse.json({ error: 'Senha do certificado obrigatória' }, { status: 400 });
  if (!/\.p(12|fx)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Envie um arquivo .pfx ou .p12' }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length || buf.length > MAX_PFX_BYTES) {
    return NextResponse.json({ error: 'Arquivo inválido ou grande demais' }, { status: 400 });
  }

  // Validação real: tenta montar um contexto TLS com o pfx+senha.
  try {
    tls.createSecureContext({ pfx: buf, passphrase: senha });
  } catch {
    return NextResponse.json({ error: 'Certificado ou senha inválidos' }, { status: 400 });
  }

  mkdirSync(DIR, { recursive: true });
  chmodSync(DIR, 0o700);
  const pfxPath = path.join(DIR, `${rotulo}.pfx`);
  const passPath = path.join(DIR, `${rotulo}.pass`);
  writeFileSync(pfxPath, buf, { mode: 0o600 });
  writeFileSync(passPath, senha, { mode: 0o600 });
  chmodSync(pfxPath, 0o600); chmodSync(passPath, 0o600);

  const email = (request.headers.get('x-user-email') || '').toLowerCase();
  const meta = readMeta();
  meta[rotulo] = {
    installed_at: new Date().toISOString(),
    installed_by: email,
    file_name: file.name,
    ...pfxInfo(pfxPath, senha),
  };
  writeMeta(meta);

  return NextResponse.json({ ok: true, slug: rotulo, ...meta[rotulo] });
}
