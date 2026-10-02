import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import tls from 'tls';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DIR = path.join(process.cwd(), 'private-downloads', 'sefaz');
const CERT_PATH = path.join(DIR, 'certificado.pfx');
const PASS_PATH = path.join(DIR, 'certificado.pass');
const META_PATH = path.join(DIR, 'certificado.meta.json');
const MAX_PFX_BYTES = 1 * 1024 * 1024; // A1 cabe em ~5KB; 1MB já é folga enorme

// Quem pode instalar o certificado: lista fechada de emails (env).
// Sem a env configurada, NINGUÉM acessa — fail-closed proposital.
function allowedEmails(): string[] {
  return (process.env.SEFAZ_CERT_ALLOWED_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
function isAllowed(request: NextRequest): boolean {
  const email = (request.headers.get('x-user-email') || '').toLowerCase();
  return !!email && allowedEmails().includes(email);
}

// Extrai subject/validade do .pfx via openssl (best-effort — se falhar,
// o certificado ainda está válido, só não mostramos os metadados).
function pfxInfo(pfxPath: string, pass: string): { subject?: string; validade?: string } {
  try {
    const out = execFileSync(
      'openssl',
      ['pkcs12', '-in', pfxPath, '-clcerts', '-nokeys', '-passin', `pass:${pass}`, '-noout'],
      { timeout: 15000 }
    ).toString('utf-8');
    const pem = execFileSync(
      'openssl',
      ['pkcs12', '-in', pfxPath, '-clcerts', '-nokeys', '-passin', `pass:${pass}`],
      { timeout: 15000 }
    ).toString('utf-8');
    const subject = /subject\s*=\s*(.+)/.exec(out)?.[1]?.trim();
    const notAfter = /notAfter\s*=\s*(.+)/.exec(pem)?.[1]?.trim()
      || /notAfter=(.+)/.exec(pem)?.[1]?.trim();
    return { subject, validade: notAfter };
  } catch {
    return {};
  }
}

// GET — status (se tem certificado, pra quem é, até quando). Nunca expõe o arquivo.
export async function GET(request: NextRequest) {
  if (!isAllowed(request)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  if (!existsSync(CERT_PATH)) return NextResponse.json({ installed: false });
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(readFileSync(META_PATH, 'utf-8')); } catch { /* ok */ }
  return NextResponse.json({ installed: true, ...meta });
}

// POST multipart: file (.pfx/.p12) + senha. Valida que a senha abre o
// certificado antes de gravar — arquivo errado não "instala".
export async function POST(request: NextRequest) {
  if (!isAllowed(request)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const form = await request.formData();
  const file = form.get('file');
  const senha = String(form.get('senha') || '');
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
  writeFileSync(CERT_PATH, buf, { mode: 0o600 });
  writeFileSync(PASS_PATH, senha, { mode: 0o600 });

  const email = (request.headers.get('x-user-email') || '').toLowerCase();
  const info = pfxInfo(CERT_PATH, senha);
  const meta = {
    installed_at: new Date().toISOString(),
    installed_by: email,
    file_name: file.name,
    ...info,
  };
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2), { mode: 0o600 });
  chmodSync(CERT_PATH, 0o600); chmodSync(PASS_PATH, 0o600); chmodSync(META_PATH, 0o600);

  return NextResponse.json({ ok: true, ...meta });
}
