import type { GeminiExtractedData, GeminiResult } from './gemini';

interface GeminiModel {
  name: string;
  rpm: number;
  rpd: number;
  minIntervalMs: number;
}

const MODELS: GeminiModel[] = [
  { name: 'gemini-3.1-flash-lite', rpm: 15, rpd: 500, minIntervalMs: 4200 },
  { name: 'gemini-2.5-flash-lite', rpm: 10, rpd: 20, minIntervalMs: 6200 },
  { name: 'gemini-2.5-flash', rpm: 5, rpd: 20, minIntervalMs: 12200 },
  { name: 'gemini-3-flash', rpm: 5, rpd: 20, minIntervalMs: 12200 },
  { name: 'gemini-3.5-flash', rpm: 5, rpd: 20, minIntervalMs: 12200 },
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const modelState: Record<string, { lastCallTime: number; cooldownUntil: number; requestsToday: number }> = {};
for (const m of MODELS) {
  modelState[m.name] = { lastCallTime: 0, cooldownUntil: 0, requestsToday: 0 };
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

function getNextAvailableModel(): { model: GeminiModel; state: typeof modelState[string] } | null {
  const now = Date.now();
  for (let i = 0; i < MODELS.length; i++) {
    const idx = (currentModelIdx + i) % MODELS.length;
    const model = MODELS[idx];
    const state = modelState[model.name];
    if (now >= state.cooldownUntil && state.requestsToday < model.rpd) {
      currentModelIdx = idx;
      return { model, state };
    }
  }
  return null;
}

function markModelRateLimited(modelName: string, cooldownMs: number = 60000) {
  const state = modelState[modelName];
  if (state) {
    state.cooldownUntil = Date.now() + cooldownMs;
    console.log(`[GeminiDirect] Model ${modelName} rate-limited, cooldown ${cooldownMs / 1000}s`);
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
  try {
    const payload = {
      contents: [{
        parts: [
          { text: buildPrompt() },
          {
            inline_data: {
              mime_type: mimeType,
              data: fileBase64,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    };

    let lastError = '';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const available = getNextAvailableModel();
      if (!available) {
        const earliestCooldown = Math.min(...Object.values(modelState).map(s => s.cooldownUntil));
        const waitMs = Math.max(0, earliestCooldown - Date.now());
        if (waitMs > 0) {
          logThrottled(`[GeminiDirect] All models in cooldown, waiting ${Math.ceil(waitMs / 1000)}s...`);
          await sleep(Math.min(waitMs, 30000));
        }
        continue;
      }

      const { model, state } = available;
      const apiUrl = `${GEMINI_API_BASE}/${model.name}:generateContent?key=${apiKey}`;

      const elapsed = Date.now() - state.lastCallTime;
      if (elapsed < model.minIntervalMs) {
        const wait = model.minIntervalMs - elapsed;
        await sleep(wait);
      }
      state.lastCallTime = Date.now();

      console.log(`[GeminiDirect] Using ${model.name} (attempt ${attempt + 1}/${maxRetries})`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 200) {
        state.requestsToday++;
        const result = await response.json();
        const candidates = result.candidates;
        if (!candidates || candidates.length === 0) {
          return { success: false, error: 'Empty response from Gemini Direct' };
        }

        const text = candidates[0].content.parts[0].text;

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
        console.log(`[GeminiDirect] ${model.name} got 429 (RPD limit), switching model...`);
        markModelRateLimited(model.name, 3600000); // 1h cooldown for RPD limit
        state.requestsToday = model.rpd; // Mark as exhausted
        lastError = `429 on ${model.name}`;
        continue;
      }

      if (response.status === 503) {
        console.log(`[GeminiDirect] ${model.name} got 503, short cooldown...`);
        markModelRateLimited(model.name, 30000); // 30s cooldown for 503
        lastError = `503 on ${model.name}`;
        continue;
      }

      const errorText = await response.text();
      lastError = `API error ${response.status} on ${model.name}: ${errorText.slice(0, 200)}`;
      console.log(`[GeminiDirect] ${lastError}`);
      markModelRateLimited(model.name, 60000);
    }

    return { success: false, error: lastError || `All Gemini models exhausted after ${maxRetries} attempts` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { success: false, error: 'Timeout requesting Gemini Direct API' };
    }
    return { success: false, error: msg };
  }
}

export function isPdfUrl(url: string): boolean {
  return isPdf(url);
}
