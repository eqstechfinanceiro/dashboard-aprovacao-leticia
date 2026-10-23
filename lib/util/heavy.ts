import { NextResponse } from 'next/server';

// Semáforo em processo para operações pesadas (exports XLSX, cálculo de
// quinzena). Antes, N exports concorrentes (~600MB heap cada) derrubavam o
// processo — serialize em vez de OOM. Aplicar SOMENTE em rotas-folha:
// orquestradores (freeze/fechar) chamam essas rotas via HTTP interno e
// segurariam o slot esperando o próprio slot = deadlock.
type Release = () => void;

class Limiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(
    private max: number,
    private maxQueue: number,
  ) {}

  acquire(): Promise<Release | null> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve(this.makeRelease());
    }
    if (this.queue.length >= this.maxQueue) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve(this.makeRelease());
      });
    });
  }

  private makeRelease(): Release {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.running--;
      this.queue.shift()?.();
    };
  }
}

// export: fila zero — o request morreria no requestTimeout do Node (~300s)
// esperando um export de ~6min; 503 imediato com Retry-After é honesto.
export const exportLimiter = new Limiter(1, 0);
// compute: cálculo ~30-60s < 300s — fila curta viabiliza bursts sem crash.
export const computeLimiter = new Limiter(2, 16);

export function heavyBusy() {
  return NextResponse.json(
    { error: 'Outra exportação/cálculo pesado em andamento. Aguarde e tente novamente.', code: 'heavy_busy' },
    { status: 503, headers: { 'Retry-After': '30' } },
  );
}
