import { createCanvas, DOMMatrix as CanvasDOMMatrix } from 'canvas';
import path from 'path';

// Polyfill Promise.withResolvers for Node.js < v22 (pdfjs-dist v4+ requires it)
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Polyfill process.getBuiltinModule for Node.js < v22 (pdfjs-dist v4+ uses it)
if (typeof (process as any).getBuiltinModule === 'undefined') {
  (process as any).getBuiltinModule = (name: string) => {
    try {
      return require(name);
    } catch {
      return undefined;
    }
  };
}

// Polyfill browser APIs required by pdfjs-dist in Node.js
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = CanvasDOMMatrix;
}

export interface PdfImage {
  base64: string;
  mimeType: string;
}

export async function pdfToImages(
  pdfBuffer: Buffer,
  scale = 1.5,
  maxPages = 3
): Promise<PdfImage[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const standardFontDataUrl = path.join(
    process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts'
  ) + '/';

  const uint8 = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjs.getDocument({
    data: uint8,
    standardFontDataUrl,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;

  const pageCount = Math.min(doc.numPages, maxPages);
  const images: PdfImage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    await page.render({ canvasContext: ctx as any, canvas: canvas as any, viewport }).promise;
    const jpegBuffer = (canvas as any).toBuffer('image/jpeg', { quality: 0.85 });
    images.push({ base64: jpegBuffer.toString('base64'), mimeType: 'image/jpeg' });
  }

  return images;
}

export async function extractPdfText(
  pdfBuffer: Buffer,
  maxPages = 3
): Promise<string | null> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const standardFontDataUrl = path.join(
    process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts'
  ) + '/';

  const uint8 = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjs.getDocument({
    data: uint8,
    standardFontDataUrl,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;

  const pageCount = Math.min(doc.numPages, maxPages);
  const textParts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .filter((s: string) => s.trim().length > 0)
      .join(' ');
    if (pageText.trim()) {
      textParts.push(pageText.trim());
    }
  }

  const fullText = textParts.join('\n').trim();
  return fullText.length > 20 ? fullText : null;
}
