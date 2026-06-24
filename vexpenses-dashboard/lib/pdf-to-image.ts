import { createCanvas } from '@napi-rs/canvas';

export interface PdfImage {
  base64: string;
  mimeType: string;
}

export async function pdfToImages(
  pdfBuffer: Buffer,
  scale = 1.5,
  maxPages = 3
): Promise<PdfImage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const uint8 = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjs.getDocument({ data: uint8 });
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
    const jpegBuffer = canvas.toBuffer('image/jpeg', 0.85);
    images.push({ base64: jpegBuffer.toString('base64'), mimeType: 'image/jpeg' });
  }

  return images;
}
