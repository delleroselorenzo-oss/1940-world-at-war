import { inflateSync } from "node:zlib";

// Lettore minimo di PNG (8 bit, RGB o RGBA, senza interlacciamento): basta per le tessere di altitudine
// e di copertura del suolo, senza aggiungere dipendenze.

export interface Image {
  width: number;
  height: number;
  /** Canali per pixel (3 = RGB, 4 = RGBA). */
  channels: number;
  data: Uint8Array;
}

export function decodePng(buf: Uint8Array): Image {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  while (pos < buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const depth = body[8];
      const color = body[9];
      if (depth !== 8 || (color !== 2 && color !== 6) || body[12] !== 0) throw new Error(`PNG non supportato (profondità ${depth}, colore ${color})`);
      channels = color === 2 ? 3 : 4;
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[out + x - channels]! : 0;
      const b = y > 0 ? data[out - stride + x]! : 0;
      const c = x >= channels && y > 0 ? data[out - stride + x - channels]! : 0;
      let v = raw[src + x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      data[out + x] = v & 0xff;
    }
  }
  return { width, height, channels, data };
}
