import { processReceiptGeminiDirect, processReceiptGeminiDirectBase64, isPdfUrl } from './gemini-direct';
import type { GeminiResult } from './gemini';
import { pdfToImages, type PdfImage } from './pdf-to-image';

export interface HybridResult extends GeminiResult {
  provider: 'gemini-direct' | 'skipped';
}

function isPdf(url: string): boolean {
  return isPdfUrl(url);
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
  _groqApiKey?: string,
  geminiApiKey?: string,
  _openRouterApiKey?: string
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

  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    return {
      success: false,
      error: 'No GEMINI_API_KEY configured',
      provider: 'skipped',
    };
  }

  if (pdfImages) {
    const result = await processReceiptGeminiDirectBase64(
      pdfImages[0].base64,
      pdfImages[0].mimeType,
      apiKey,
      5
    );
    return { ...result, provider: result.success ? 'gemini-direct' : 'skipped' };
  }

  const result = await processReceiptGeminiDirect(imageUrl, apiKey, 5);
  return { ...result, provider: result.success ? 'gemini-direct' : 'skipped' };
}
