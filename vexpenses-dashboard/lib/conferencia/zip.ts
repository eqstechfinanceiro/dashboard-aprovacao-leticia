/**
 * Extrator ZIP mínimo — SIEG devolve ZIPs com um único .xml.
 * Suporta stored (method 0) e deflate (method 8) via zlib, sem dependência.
 */
import { inflateRawSync } from 'zlib';

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  size: number;
  localOffset: number;
}

function findEocd(buf: Buffer): number {
  // EOCD tem 22 bytes + até 65535 de comentário — varre de trás pra frente.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

export function unzipFirstFile(buf: Buffer): { name: string; data: Buffer } | null {
  const eocd = findEocd(buf);
  if (eocd < 0) return null;
  const cdirOffset = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);

  const entries: ZipEntry[] = [];
  let p = cdirOffset;
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== CDIR_SIG) break;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({
      method: buf.readUInt16LE(p + 10),
      compSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
      name: buf.slice(p + 46, p + 46 + nameLen).toString('utf-8'),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }

  for (const e of entries) {
    if (!/\.xml$/i.test(e.name) && entries.length > 1) continue;
    let q = e.localOffset;
    if (buf.readUInt32LE(q) !== LFH_SIG) continue;
    const lNameLen = buf.readUInt16LE(q + 26);
    const lExtraLen = buf.readUInt16LE(q + 28);
    q += 30 + lNameLen + lExtraLen;
    const comp = buf.slice(q, q + e.compSize);
    try {
      const data = e.method === 0 ? comp : inflateRawSync(comp);
      return { name: e.name, data };
    } catch {
      return null;
    }
  }
  return null;
}
