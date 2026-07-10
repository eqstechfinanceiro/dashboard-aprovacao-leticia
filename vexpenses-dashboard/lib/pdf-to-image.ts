import { createCanvas } from '@napi-rs/canvas';

// Polyfill DOMMatrix for Node.js (required by pdfjs-dist v6)
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    constructor(_init?: any) {}
    multiply(other: DOMMatrixPolyfill) {
      const r = new DOMMatrixPolyfill();
      r.a = this.a * other.a + this.c * other.b;
      r.b = this.b * other.a + this.d * other.b;
      r.c = this.a * other.c + this.c * other.d;
      r.d = this.b * other.c + this.d * other.d;
      r.e = this.a * other.e + this.c * other.f + this.e;
      r.f = this.b * other.e + this.d * other.f + this.f;
      r.m11 = r.a; r.m12 = r.b; r.m21 = r.c; r.m22 = r.d; r.m41 = r.e; r.m42 = r.f;
      return r;
    }
    translate(tx: number, ty: number, _tz = 0) {
      const r = new DOMMatrixPolyfill();
      r.a = this.a; r.b = this.b; r.c = this.c; r.d = this.d;
      r.e = this.e + tx; r.f = this.f + ty;
      r.m11 = r.a; r.m12 = r.b; r.m21 = r.c; r.m22 = r.d; r.m41 = r.e; r.m42 = r.f;
      return r;
    }
    scale(sx: number, _sy = sx, _sz = 1, _ox = 0, _oy = 0, _oz = 0) {
      const r = new DOMMatrixPolyfill();
      r.a = this.a * sx; r.b = this.b * sx; r.c = this.c * sx; r.d = this.d * sx;
      r.e = this.e * sx; r.f = this.f * sx;
      r.m11 = r.a; r.m12 = r.b; r.m21 = r.c; r.m22 = r.d; r.m41 = r.e; r.m42 = r.f;
      return r;
    }
    inverse() {
      const det = this.a * this.d - this.b * this.c;
      if (det === 0) return new DOMMatrixPolyfill();
      const invDet = 1 / det;
      const r = new DOMMatrixPolyfill();
      r.a = this.d * invDet; r.b = -this.b * invDet;
      r.c = -this.c * invDet; r.d = this.a * invDet;
      r.e = (this.c * this.f - this.d * this.e) * invDet;
      r.f = (this.b * this.e - this.a * this.f) * invDet;
      r.m11 = r.a; r.m12 = r.b; r.m21 = r.c; r.m22 = r.d; r.m41 = r.e; r.m42 = r.f;
      return r;
    }
    transformPoint(point: { x: number; y: number }) {
      return {
        x: this.a * point.x + this.c * point.y + this.e,
        y: this.b * point.x + this.d * point.y + this.f,
      };
    }
  }
  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
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
