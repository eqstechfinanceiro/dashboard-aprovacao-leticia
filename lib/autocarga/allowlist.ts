// Allowlist da auto-carga: só estes 3 usuários podem disparar movimentação de
// dinheiro real. Checagem por e-mail exato (nunca por nome — existe mais de
// uma "Leticia" em app_users).

import { NextRequest, NextResponse } from 'next/server';

const AUTOCARGA_ALLOWED = new Set([
  'italo.medrado@eqsengenharia.com.br',
  'leticia@eqsengenharia.com.br',
  'andrey.reginaldo@eqsengenharia.com.br',
]);

export function isAutocargaAllowedEmail(email: string | null | undefined): boolean {
  return !!email && AUTOCARGA_ALLOWED.has(email.toLowerCase());
}

// Retorna null se permitido; caso contrário a resposta 403 pronta.
export function denyIfNotAutocarga(request: NextRequest): NextResponse | null {
  const email = request.headers.get('x-user-email');
  if (isAutocargaAllowedEmail(email)) return null;
  return NextResponse.json(
    { error: 'Auto-carga restrita a operadores autorizados' },
    { status: 403 },
  );
}
