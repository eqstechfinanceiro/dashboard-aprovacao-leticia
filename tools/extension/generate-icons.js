// Gera icon16/48/128.png a partir do logo oficial (public/aery-logo.png)
// Uso: node tools/extension/generate-icons.js
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const logoPath = path.join(__dirname, '..', '..', 'public', 'aery-logo.png');
const dir = __dirname;

(async () => {
  // load via Buffer — evita problema de encoding em caminhos com acentos (Windows)
  const img = await loadImage(fs.readFileSync(logoPath));
  for (const s of [16, 48, 128]) {
    const canvas = createCanvas(s, s);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, s, s);
    fs.writeFileSync(path.join(dir, `icon${s}.png`), canvas.toBuffer('image/png'));
    console.log(`Created icon${s}.png`);
  }
})();
