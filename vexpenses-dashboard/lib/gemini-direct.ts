import type { GeminiExtractedData, GeminiResult } from './gemini';

type ProviderType = 'gemini' | 'groq';

interface OcrModel {
  id: string;
  provider: ProviderType;
  rpm: number;
  rpd: number;
  minIntervalMs: number;
}

const MODELS: OcrModel[] = [
  { id: 'gemini-2.5-flash-lite',       provider: 'gemini', rpm: 30, rpd: 1000, minIntervalMs: 2100 },
  { id: 'gemini-3.1-flash-lite',       provider: 'gemini', rpm: 30, rpd: 1000, minIntervalMs: 2100 },
  { id: 'gemini-3.1-flash-lite-preview', provider: 'gemini', rpm: 30, rpd: 1000, minIntervalMs: 2100 },
  { id: 'gemini-flash-lite-latest',    provider: 'gemini', rpm: 30, rpd: 1000, minIntervalMs: 2100 },
  { id: 'gemini-2.5-flash',            provider: 'gemini', rpm: 10, rpd: 250,  minIntervalMs: 6200 },
  { id: 'gemini-3-flash-preview',      provider: 'gemini', rpm: 10, rpd: 250,  minIntervalMs: 6200 },
  { id: 'gemini-3.5-flash',            provider: 'gemini', rpm: 10, rpd: 250,  minIntervalMs: 6200 },
  { id: 'gemini-flash-latest',         provider: 'gemini', rpm: 10, rpd: 250,  minIntervalMs: 6200 },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq', rpm: 30, rpd: 1000, minIntervalMs: 2100 },
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface ModelState {
  lastCallTime: number;
  cooldownUntil: number;
  requestsToday: number;
  lastResetDay: string;
}

const modelState: Record<string, ModelState> = {};
for (const m of MODELS) {
  modelState[m.id] = { lastCallTime: 0, cooldownUntil: 0, requestsToday: 0, lastResetDay: '' };
}

let currentModelIdx = 0;
let lastLogTime = 0;

function buildPrompt(): string {
  return `Analise este comprovante fiscal brasileiro (NFc-e, SAT, cupom, nota fiscal, DANFE) e extraia as seguintes informações em formato JSON:

{
  "valor_total": "valor monetário total da nota (formato: XX,XX)",
  "data": "data da emissão (formato: DD/MM/AAAA)",
  "estabelecimento": "nome do estabelecimento/empresa",
  "categoria": "categoria da despesa baseada nos produtos/serviços",
  "cnpj": "CNPJ do estabelecimento (se visível)",
  "itens": ["lista de produtos/serviços principais"],
  "forma_pagamento": "forma de pagamento (dinheiro, cartão, pix, etc)"
}

Regras:
- O valor_total deve ser o VALOR TOTAL DA NOTA ou VALOR PAGO, não valores individuais de itens ou impostos
- A categoria deve ser uma das seguintes: ALIMENTACAO, TRANSPORTE, MATERIAIS_CONSTRUCAO, FERRAMENTA, ELETRONICO, FARMACIA, LIMPEZA, COMBUSTIVEL, ESTACIONAMENTO, OUTROS
- Se um campo não for visível ou legível, use null
- Retorne APENAS o JSON, sem texto adicional ou markdown`;
}

function getMimeType(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf') || lower.includes('/pdfs/')) return 'application/pdf';
  return 'image/jpeg';
}

function isPdf(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return lower.endsWith('.pdf') || lower.includes('/pdfs/');
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetDailyCountersIfNeeded() {
  const today = getTodayKey();
  for (const model of MODELS) {
    const state = modelState[model.id];
    if (state.lastResetDay !== today) {
      state.requestsToday = 0;
      state.lastResetDay = today;
      state.cooldownUntil = 0;
    }
  }
}

function getNextAvailableModel(): { model: OcrModel; state: ModelState } | null {
  resetDailyCountersIfNeeded();
  const now = Date.now();
  for (let i = 0; i < MODELS.length; i++) {
    const idx = (currentModelIdx + i) % MODELS.length;
    const model = MODELS[idx];
    const state = modelState[model.id];
    if (now >= state.cooldownUntil && state.requestsToday < model.rpd) {
      currentModelIdx = idx;
      return { model, state };
    }
  }
  return null;
}

function markModelRateLimited(modelId: string, cooldownMs: number = 60000) {
  const state = modelState[modelId];
  if (state) {
    state.cooldownUntil = Date.now() + cooldownMs;
    console.log(`[GeminiDirect] Model ${modelId} rate-limited, cooldown ${cooldownMs / 1000}s`);
  }
}

function logThrottled(msg: string) {
  const now = Date.now();
  if (now - lastLogTime > 2000) {
    console.log(msg);
    lastLogTime = now;
  }
}

export async function processReceiptGeminiDirect(
  fileUrl: string,
  apiKey: string,
  maxRetries = 3
): Promise<GeminiResult> {
  try {
    const response = await fetch(fileUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return { success: false, error: `Failed to download: ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = getMimeType(fileUrl);

    return processReceiptGeminiDirectBase64(base64, mimeType, apiKey, maxRetries);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { success: false, error: 'Timeout downloading file' };
    }
    return { success: false, error: msg };
  }
}

export async function processReceiptGeminiDirectBase64(
  fileBase64: string,
  mimeType: string,
  apiKey: string,
  maxRetries = 3
): Promise<GeminiResult> {
  const groqApiKey = process.env.GROQ_API_KEY || '';
  try {
    const prompt = buildPrompt();
    let lastError = '';
    let actualApiCalls = 0;
    let totalWaitMs = 0;
    const MAX_TOTAL_WAIT_MS = 120000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const available = getNextAvailableModel();
      if (!available) {
        const earliestCooldown = Math.min(...Object.values(modelState).map(s => s.cooldownUntil));
        const waitMs = Math.max(0, earliestCooldown - Date.now());
        if (waitMs > 0 && totalWaitMs < MAX_TOTAL_WAIT_MS) {
          const actualWait = Math.min(waitMs, 30000);
          logThrottled(`[GeminiDirect] All models in cooldown, waiting ${Math.ceil(actualWait / 1000)}s...`);
          await sleep(actualWait);
          totalWaitMs += actualWait;
          attempt--;
          continue;
        }
        lastError = `All models exhausted (waited ${Math.ceil(totalWaitMs / 1000)}s total)`;
        break;
      }

      const { model, state } = available;

      const elapsed = Date.now() - state.lastCallTime;
      if (elapsed < model.minIntervalMs) {
        const wait = model.minIntervalMs - elapsed;
        await sleep(wait);
      }
      state.lastCallTime = Date.now();
      actualApiCalls++;

      console.log(`[GeminiDirect] Using ${model.id} (attempt ${attempt + 1}/${maxRetries}, api call ${actualApiCalls})`);

      let response: Response;
      let responseText: string;

      if (model.provider === 'groq') {
        if (!groqApiKey) {
          markModelRateLimited(model.id, 3600000);
          continue;
        }
        const payload = {
          model: model.id,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
            ],
          }],
          temperature: 0.1,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
        };
        response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqApiKey}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(60000),
        });
      } else {
        const payload = {
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: fileBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        };
        const apiUrl = `${GEMINI_API_BASE}/${model.id}:generateContent?key=${apiKey}`;
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });
      }

      if (response.status === 200) {
        state.requestsToday++;
        const result = await response.json();

        let text: string;
        if (model.provider === 'groq') {
          text = result.choices?.[0]?.message?.content || '';
        } else {
          const candidates = result.candidates;
          if (!candidates || candidates.length === 0) {
            return { success: false, error: 'Empty response from model' };
          }
          text = candidates[0].content.parts[0].text;
        }

        if (!text) {
          return { success: false, error: 'Empty text in response' };
        }

        let extracted: GeminiExtractedData;
        try {
          extracted = JSON.parse(text);
        } catch {
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}') + 1;
          if (start >= 0 && end > start) {
            extracted = JSON.parse(text.slice(start, end));
          } else {
            return { success: false, error: `Could not parse JSON: ${text.slice(0, 200)}` };
          }
        }

        return {
          success: true,
          structured_data: extracted,
          raw_response: text,
        };
      }

      if (response.status === 429) {
        const errorText = await response.text().catch(() => '');
        const isRpdExhausted = errorText.toLowerCase().includes('quota') || errorText.toLowerCase().includes('daily');
        if (isRpdExhausted) {
          console.log(`[GeminiDirect] ${model.id} got 429 (RPD exhausted), marking as exhausted for today`);
          state.requestsToday = model.rpd;
          markModelRateLimited(model.id, 3600000);
        } else {
          const cooldownMs = Math.min(Math.pow(2, attempt) * 5000, 30000);
          console.log(`[GeminiDirect] ${model.id} got 429 (RPM limit), cooldown ${cooldownMs / 1000}s`);
          markModelRateLimited(model.id, cooldownMs);
        }
        lastError = `429 on ${model.id}`;
        continue;
      }

      if (response.status === 503) {
        console.log(`[GeminiDirect] ${model.id} got 503, short cooldown...`);
        markModelRateLimited(model.id, 30000);
        lastError = `503 on ${model.id}`;
        continue;
      }

      const errorText = await response.text().catch(() => '');
      lastError = `API error ${response.status} on ${model.id}: ${errorText.slice(0, 200)}`;
      console.log(`[GeminiDirect] ${lastError}`);
      markModelRateLimited(model.id, 60000);
    }

    return { success: false, error: lastError || `All models exhausted after ${maxRetries} attempts` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { success: false, error: 'Timeout requesting OCR API' };
    }
    return { success: false, error: msg };
  }
}

export function isPdfUrl(url: string): boolean {
  return isPdf(url);
}
