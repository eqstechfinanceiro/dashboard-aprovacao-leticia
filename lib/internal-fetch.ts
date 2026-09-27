import { NextRequest } from 'next/server';

/**
 * Base URL para chamadas internas API->API.
 *
 * Atras do nginx, `request.url` chega com a origem publica (https://dominio)
 * ou ate https://localhost:PORT (X-Forwarded-Proto + host local). Refazer o
 * fetch por https forca hairpin pela internet ou TLS numa porta HTTP
 * (ERR_SSL_WRONG_VERSION_NUMBER). Loopback sempre responde HTTP — nunca
 * reusar o scheme da origem.
 */
export function internalBase(req: NextRequest): string {
  const { hostname, port } = new URL(req.url);
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(hostname)) {
    return `http://${hostname}${port ? `:${port}` : ''}`;
  }
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}
