import type { GeminiExtractedData, GeminiResult } from './gemini';

const OPENROUTER_MODEL = 'google/gemini-2.5-flash';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let lastOpenRouterCallTime = 0;
const MIN_INTERVAL_BETWEEN_CALLS = 500;

function buildPrompt(): string {
  return `Analise esta imagem de comprovante fiscal brasileiro (NFc-e, SAT, cupom, nota fiscal, DANFE) e extraia as seguintes informações em formato JSON:

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
  return 'image/jpeg';
}

export async function processReceiptImageOpenRouter(
  imageUrl: string,
  apiKey: string,
  maxRetries = 1
): Promise<GeminiResult> {
  try {
    const imageResponse = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!imageResponse.ok) {
      return { success: false, error: `Failed to download image: ${imageResponse.status}` };
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    const mimeType = getMimeType(imageUrl);

    return processReceiptImageOpenRouterBase64(imageBase64, mimeType, apiKey, maxRetries);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { success: false, error: 'Timeout requesting OpenRouter API' };
    }
    return { success: false, error: msg };
  }
}

export async function processReceiptImageOpenRouterBase64(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  maxRetries = 1
): Promise<GeminiResult> {
  try {
    const payload = {
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt() },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    };

    let response: Response | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const elapsed = Date.now() - lastOpenRouterCallTime;
      if (elapsed < MIN_INTERVAL_BETWEEN_CALLS) {
        const wait = MIN_INTERVAL_BETWEEN_CALLS - elapsed;
        console.log(`[OpenRouter] Rate limit protection, waiting ${wait}ms before call...`);
        await sleep(wait);
      }
      lastOpenRouterCallTime = Date.now();

      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 200) break;

      if (response.status === 429 || response.status === 503) {
        const waitTime = Math.pow(2, attempt) * 3000;
        console.log(`[OpenRouter] API ${response.status}, attempt ${attempt + 1}/${maxRetries}, waiting ${waitTime}ms...`);
        await sleep(waitTime);
        if (attempt < maxRetries - 1) continue;
      } else {
        const errorText = await response.text();
        return { success: false, error: `OpenRouter API error ${response.status}: ${errorText.slice(0, 200)}` };
      }
    }

    if (!response || response.status !== 200) {
      return { success: false, error: `OpenRouter API error after ${maxRetries} attempts` };
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;

    if (!text) {
      return { success: false, error: 'Empty response from OpenRouter' };
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
        return { success: false, error: `Could not parse JSON from OpenRouter: ${text.slice(0, 200)}` };
      }
    }

    return {
      success: true,
      structured_data: extracted,
      raw_response: text,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { success: false, error: 'Timeout requesting OpenRouter API' };
    }
    return { success: false, error: msg };
  }
}
