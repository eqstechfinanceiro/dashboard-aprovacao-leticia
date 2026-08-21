const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size) {
  const w = size, h = size;
  const pixels = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = Math.floor(i / w);
    const cx = w / 2, cy = h / 2;
    const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (r <= w * 0.45) {
      pixels[i * 4] = 37;
      pixels[i * 4 + 1] = 99;
      pixels[i * 4 + 2] = 235;
      pixels[i * 4 + 3] = 255;
    } else {
      pixels[i * 4 + 3] = 0;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type);
    const crc32 = Buffer.alloc(4);
    let crc = 0xFFFFFFFF;
    const all = Buffer.concat([typeB, data]);
    for (let i = 0; i < all.length; i++) {
      crc ^= all[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xEDB88320 & (crc & 1 ? 0xFFFFFFFF : 0));
      }
    }
    crc32.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, 0);
    return Buffer.concat([len, typeB, data, crc32]);
  }
  
  const ihdrChunk = chunk('IHDR', ihdr);
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    pixels.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idatChunk = chunk('IDAT', zlib.deflateSync(raw));
  const iendChunk = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const dir = __dirname;
[16, 48, 128].forEach(s => {
  fs.writeFileSync(path.join(dir, 'icon' + s + '.png'), createPNG(s));
  console.log('Created icon' + s + '.png');
});
