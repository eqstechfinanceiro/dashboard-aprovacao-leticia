"use strict";
// Rate limiter global para requisições à API VExpenses
// Máximo 5 req/s com fila sequencial e backpressure
Object.defineProperty(exports, "__esModule", { value: true });
exports.vexpensesRateLimiter = void 0;
exports.rateLimitedFetch = rateLimitedFetch;
class RateLimiter {
    constructor(maxRequestsPerSecond = 5, maxQueueSize = 50) {
        this.queue = [];
        this.processing = false;
        this.lastRequestAt = 0;
        this.pausedUntil = 0;
        this.totalRequests = 0;
        this.totalDelayed = 0;
        this.totalRejected = 0;
        this.minIntervalMs = 1000 / maxRequestsPerSecond;
        this.maxQueueSize = maxQueueSize;
    }
    get isPaused() {
        return Date.now() < this.pausedUntil;
    }
    pause(durationMs) {
        const pauseUntil = Date.now() + durationMs;
        if (pauseUntil > this.pausedUntil) {
            this.pausedUntil = pauseUntil;
            console.log(`[RateLimiter] Paused until ${new Date(pauseUntil).toISOString()} (${durationMs}ms)`);
        }
    }
    async enqueue(fn, priority = 0) {
        if (this.queue.length >= this.maxQueueSize) {
            this.totalRejected++;
            throw new Error(`[RateLimiter] Queue full (${this.maxQueueSize} items). Try again later.`);
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve: resolve, reject, priority, enqueuedAt: Date.now() });
            this.queue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt);
            this.process();
        });
    }
    async process() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            // If paused (due to 429/403), wait until pause expires
            if (this.isPaused) {
                const waitMs = this.pausedUntil - Date.now();
                console.log(`[RateLimiter] Waiting ${waitMs}ms for pause to expire...`);
                await new Promise(r => setTimeout(r, waitMs + 100));
                continue;
            }
            const item = this.queue.shift();
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
            }
            catch (error) {
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
// 5 req/s, queue up to 500 items (enough for ~269 reports + overhead)
exports.vexpensesRateLimiter = new RateLimiter(5, 500);
// Helper para usar com fetch
async function rateLimitedFetch(url, options = {}, priority = 0) {
    return exports.vexpensesRateLimiter.enqueue(() => fetch(url, { ...options, cache: 'no-store' }), priority);
}
