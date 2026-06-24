import { processReceiptImage, processReceiptImageBase64, type GeminiResult } from './gemini';
import { processReceiptImageGroq, processReceiptImageGroqBase64 } from './groq';
import { processReceiptImageOpenRouter, processReceiptImageOpenRouterBase64 } from './openrouter';
import { pdfToImages, type PdfImage } from './pdf-to-image';

export interface HybridResult extends GeminiResult {
  provider: 'groq' | 'openrouter' | 'gemini' | 'skipped';
}

let groqCooldownUntil = 0;
let geminiCooldownUntil = 0;
let openRouterCooldownUntil = 0;
const COOLDOWN_MS = 30000;

function isProviderAvailable(name: 'groq' | 'gemini' | 'openrouter'): boolean {
  const until = name === 'groq' ? groqCooldownUntil : name === 'openrouter' ? openRouterCooldownUntil : geminiCooldownUntil;
  return Date.now() >= until;
}

function markProviderRateLimited(name: 'groq' | 'gemini' | 'openrouter') {
  if (name === 'groq') {
    groqCooldownUntil = Date.now() + COOLDOWN_MS;
  } else if (name === 'openrouter') {
    openRouterCooldownUntil = Date.now() + COOLDOWN_MS;
  } else {
    geminiCooldownUntil = Date.now() + COOLDOWN_MS;
  }
  console.log(`[Hybrid] ${name} rate-limited, cooldown for ${COOLDOWN_MS / 1000}s`);
}

function isPdf(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return lower.endsWith('.pdf') || lower.includes('/pdfs/');
}

async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function processReceiptHybrid(
  imageUrl: string,
  groqApiKey: string,
  geminiApiKey: string,
  openRouterApiKey: string
): Promise<HybridResult> {
  let pdfImages: PdfImage[] | null = null;

  if (isPdf(imageUrl)) {
    console.log(`[Hybrid] PDF detected, converting to image: ${imageUrl}`);
    try {
      const pdfBuffer = await downloadFile(imageUrl);
      pdfImages = await pdfToImages(pdfBuffer);
      console.log(`[Hybrid] PDF converted to ${pdfImages.length} page(s)`);
    } catch (err) {
      console.log(`[Hybrid] PDF conversion failed: ${err instanceof Error ? err.message : err}`);
      return {
        success: false,
        error: `PDF conversion failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        provider: 'skipped',
      };
    }
  }

  const img = pdfImages ? { base64: pdfImages[0].base64, mime: pdfImages[0].mimeType } : null;

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Check if all providers are in cooldown - if so, wait for the earliest one
  const allInCooldown = !isProviderAvailable('openrouter') && !isProviderAvailable('groq') && !isProviderAvailable('gemini');
  if (allInCooldown) {
    const earliest = Math.min(openRouterCooldownUntil, groqCooldownUntil, geminiCooldownUntil);
    const waitMs = Math.max(0, earliest - Date.now());
    if (waitMs > 0) {
      console.log(`[Hybrid] All providers in cooldown, waiting ${Math.ceil(waitMs / 1000)}s for earliest availability...`);
      await sleep(waitMs);
    }
  }

  // 1. OpenRouter first (free, most available)
  if (openRouterApiKey && isProviderAvailable('openrouter')) {
    console.log(`[Hybrid] Trying OpenRouter (Nemotron Nano)...`);
    const orResult = img
      ? await processReceiptImageOpenRouterBase64(img.base64, img.mime, openRouterApiKey)
      : await processReceiptImageOpenRouter(imageUrl, openRouterApiKey);

    if (orResult.success && orResult.structured_data) {
      const hasCoreData =
        orResult.structured_data.valor_total !== null ||
        orResult.structured_data.estabelecimento !== null;
      if (hasCoreData) {
        console.log(`[Hybrid] OpenRouter succeeded with data`);
        return { ...orResult, provider: 'openrouter' };
      }
      console.log(`[Hybrid] OpenRouter returned empty data, falling back to Groq...`);
    } else {
      if (orResult.error?.includes('429') || orResult.error?.includes('rate limit') || orResult.error?.includes('after')) {
        markProviderRateLimited('openrouter');
      }
      console.log(`[Hybrid] OpenRouter failed: ${orResult.error}, falling back to Groq...`);
    }
  } else if (openRouterApiKey) {
    console.log(`[Hybrid] OpenRouter in cooldown, skipping...`);
  }

  // 2. Groq second
  if (groqApiKey && isProviderAvailable('groq')) {
    console.log(`[Hybrid] Trying Groq...`);
    const groqResult = img
      ? await processReceiptImageGroqBase64(img.base64, img.mime, groqApiKey)
      : await processReceiptImageGroq(imageUrl, groqApiKey);

    if (groqResult.success && groqResult.structured_data) {
      const hasCoreData =
        groqResult.structured_data.valor_total !== null ||
        groqResult.structured_data.estabelecimento !== null;
      if (hasCoreData) {
        console.log(`[Hybrid] Groq succeeded with data`);
        return { ...groqResult, provider: 'groq' };
      }
      console.log(`[Hybrid] Groq returned empty data, falling back to Gemini...`);
    } else {
      if (groqResult.error?.includes('429') || groqResult.error?.includes('rate limit') || groqResult.error?.includes('after')) {
        markProviderRateLimited('groq');
      }
      console.log(`[Hybrid] Groq failed: ${groqResult.error}, falling back to Gemini...`);
    }
  } else if (groqApiKey) {
    console.log(`[Hybrid] Groq in cooldown, skipping...`);
  }

  // 3. Gemini last
  if (geminiApiKey && isProviderAvailable('gemini')) {
    console.log(`[Hybrid] Trying Gemini fallback...`);
    const geminiResult = img
      ? await processReceiptImageBase64(img.base64, img.mime, geminiApiKey)
      : await processReceiptImage(imageUrl, geminiApiKey);

    if (geminiResult.success && geminiResult.structured_data) {
      console.log(`[Hybrid] Gemini succeeded with data`);
      return { ...geminiResult, provider: 'gemini' };
    }
    if (geminiResult.error?.includes('429') || geminiResult.error?.includes('rate limit') || geminiResult.error?.includes('after')) {
      markProviderRateLimited('gemini');
    }
    console.log(`[Hybrid] Gemini failed: ${geminiResult.error}`);
  } else if (geminiApiKey) {
    console.log(`[Hybrid] Gemini in cooldown, skipping...`);
  }

  console.log(`[Hybrid] All providers failed`);
  const failedResult: HybridResult = {
    success: false,
    error: `All providers failed`,
    provider: 'gemini',
  };
  return failedResult;
}
