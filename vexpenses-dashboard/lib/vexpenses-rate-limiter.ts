// Rate limiter global para requisições à API VExpenses
// Máximo 5 req/s com fila sequencial e backpressure

interface QueueItem {
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: number;
  enqueuedAt: number;
}

class RateLimiter {
  private queue: QueueItem[] = [];
  private processing = false;
  private lastRequestAt = 0;
  private minIntervalMs: number;
  private maxQueueSize: number;
  private pausedUntil = 0;
  private totalRequests = 0;
  private totalDelayed = 0;
  private totalRejected = 0;

  constructor(maxRequestsPerSecond = 5, maxQueueSize = 50) {
    this.minIntervalMs = 1000 / maxRequestsPerSecond;
    this.maxQueueSize = maxQueueSize;
  }

  private get isPaused(): boolean {
    return Date.now() < this.pausedUntil;
  }

  pause(durationMs: number) {
    const pauseUntil = Date.now() + durationMs;
    if (pauseUntil > this.pausedUntil) {
      this.pausedUntil = pauseUntil;
      console.log(`[RateLimiter] Paused until ${new Date(pauseUntil).toISOString()} (${durationMs}ms)`);
    }
  }

  async enqueue<T>(fn: () => Promise<T>, priority = 0): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      this.totalRejected++;
      throw new Error(`[RateLimiter] Queue full (${this.maxQueueSize} items). Try again later.`);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve: resolve as any, reject, priority, enqueuedAt: Date.now() });
      this.queue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt);
      this.process();
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // If paused (due to 429/403), wait until pause expires
      if (this.isPaused) {
        const waitMs = this.pausedUntil - Date.now();
        console.log(`[RateLimiter] Waiting ${waitMs}ms for pause to expire...`);
        await new Promise(r => setTimeout(r, waitMs + 100));
        continue;
      }

      const item = this.queue.shift()!;
      const waitMs = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (waitMs > 0) {
        this.totalDelayed++;
        await new Promise(r => setTimeout(r, waitMs));
      }

      this.lastRequestAt = Date.now();
      this.totalRequests++;

      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    this.processing = false;
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      isPaused: this.isPaused,
      pausedUntil: this.pausedUntil,
      totalRequests: this.totalRequests,
      totalDelayed: this.totalDelayed,
      totalRejected: this.totalRejected,
      minIntervalMs: this.minIntervalMs,
    };
  }

  reset() {
    this.queue = [];
    this.pausedUntil = 0;
    this.processing = false;
  }
}

// Singleton — uma única fila para toda a aplicação
export const vexpensesRateLimiter = new RateLimiter(5, 50);

// Helper para usar com fetch
export async function rateLimitedFetch(
  url: string,
  options: RequestInit = {},
  priority = 0
): Promise<Response> {
  return vexpensesRateLimiter.enqueue(
    () => fetch(url, { ...options, cache: 'no-store' }),
    priority
  );
}
