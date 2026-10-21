// Mesmo handler de /api/fiscal/portal-link — deep link do processo de
// pagamento no portal EQS, exposto pro módulo 'borderos'.
export { GET } from '@/app/api/fiscal/portal-link/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
