import { processReceiptGeminiDirect, processReceiptGeminiDirectBase64, processReceiptGeminiDirectText, isPdfUrl } from './gemini-direct';
import type { GeminiResult } from './gemini';
import { pdfToImages, extractPdfText, type PdfImage } from './pdf-to-image';

export interface HybridResult extends GeminiResult {
  provider: 'gemini-direct' | 'gemini-text' | 'skipped';
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
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    return {
      success: false,
      error: 'No GEMINI_API_KEY configured',
      provider: 'skipped',
    };
  }

  if (isPdf(imageUrl)) {
    console.log(`[Hybrid] PDF detected: ${imageUrl}`);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await downloadFile(imageUrl);
    } catch (err) {
      console.log(`[Hybrid] PDF download failed: ${err instanceof Error ? err.message : err}`);
      return {
        success: false,
        error: `PDF download failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        provider: 'skipped',
      };
    }

    // Try text extraction first (for digital PDFs)
    try {
      const pdfText = await extractPdfText(pdfBuffer);
      if (pdfText) {
        console.log(`[Hybrid] PDF has digital text (${pdfText.length} chars), using text-only Gemini`);
        const textResult = await processReceiptGeminiDirectText(pdfText, apiKey, 5);
        if (textResult.success) {
          return { ...textResult, provider: 'gemini-text' };
        }
        console.log(`[Hybrid] Text extraction succeeded but Gemini text failed: ${textResult.error}, falling back to image conversion`);
      } else {
        console.log(`[Hybrid] PDF has no digital text (scanned), converting to image`);
      }
    } catch (err) {
      console.log(`[Hybrid] PDF text extraction failed: ${err instanceof Error ? err.message : err}, falling back to image conversion`);
    }

    // Fall back to image conversion for scanned PDFs or when text extraction fails
    try {
      const pdfImages = await pdfToImages(pdfBuffer);
      console.log(`[Hybrid] PDF converted to ${pdfImages.length} page(s)`);
      const result = await processReceiptGeminiDirectBase64(
        pdfImages[0].base64,
        pdfImages[0].mimeType,
        apiKey,
        5
      );
      return { ...result, provider: result.success ? 'gemini-direct' : 'skipped' };
    } catch (err) {
      console.log(`[Hybrid] PDF conversion failed: ${err instanceof Error ? err.message : err}`);
      return {
        success: false,
        error: `PDF conversion failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        provider: 'skipped',
      };
    }
  }

  const result = await processReceiptGeminiDirect(imageUrl, apiKey, 5);
  return { ...result, provider: result.success ? 'gemini-direct' : 'skipped' };
}
