// Mesmo handler de /api/fiscal/doc — exposto sob /api/borderos porque o
// módulo 'borderos' (contas a pagar) não tem grant no prefixo /api/fiscal.
// O gate por módulo é feito no middleware (API_MODULE_MAP).
export { GET } from '@/app/api/fiscal/doc/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
