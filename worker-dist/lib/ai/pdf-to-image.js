"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pdfToImages = pdfToImages;
exports.extractPdfText = extractPdfText;
const canvas_1 = require("canvas");
const path_1 = __importDefault(require("path"));
// Polyfill Promise.withResolvers for Node.js < v22 (pdfjs-dist v4+ requires it)
if (typeof Promise.withResolvers === 'undefined') {
    Promise.withResolvers = function () {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}
// Polyfill process.getBuiltinModule for Node.js < v22 (pdfjs-dist v4+ uses it)
if (typeof process.getBuiltinModule === 'undefined') {
    process.getBuiltinModule = (name) => {
        try {
            return require(name);
        }
        catch {
            return undefined;
        }
    };
}
// Polyfill browser APIs required by pdfjs-dist in Node.js
if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = canvas_1.DOMMatrix;
}
async function pdfToImages(pdfBuffer, scale = 1.5, maxPages = 3) {
    const pdfjs = await Promise.resolve().then(() => __importStar(require('pdfjs-dist/legacy/build/pdf.mjs')));
    const standardFontDataUrl = path_1.default.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';
    const uint8 = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjs.getDocument({
        data: uint8,
        standardFontDataUrl,
        useSystemFonts: false,
    });
    const doc = await loadingTask.promise;
    const pageCount = Math.min(doc.numPages, maxPages);
    const images = [];
    for (let i = 1; i <= pageCount; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = (0, canvas_1.createCanvas)(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, viewport.width, viewport.height);
        await page.render({ canvasContext: ctx, canvas: canvas, viewport }).promise;
        const jpegBuffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
        images.push({ base64: jpegBuffer.toString('base64'), mimeType: 'image/jpeg' });
    }
    return images;
}
async function extractPdfText(pdfBuffer, maxPages = 3) {
    const pdfjs = await Promise.resolve().then(() => __importStar(require('pdfjs-dist/legacy/build/pdf.mjs')));
    const standardFontDataUrl = path_1.default.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';
    const uint8 = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjs.getDocument({
        data: uint8,
        standardFontDataUrl,
        useSystemFonts: false,
    });
    const doc = await loadingTask.promise;
    const pageCount = Math.min(doc.numPages, maxPages);
    const textParts = [];
    for (let i = 1; i <= pageCount; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item) => item.str)
            .filter((s) => s.trim().length > 0)
            .join(' ');
        if (pageText.trim()) {
            textParts.push(pageText.trim());
        }
    }
    const fullText = textParts.join('\n').trim();
    return fullText.length > 20 ? fullText : null;
}
