import { deflateSync } from "node:zlib";
import { nativeImage, type NativeImage } from "electron";

// Tray dots drawn in code, so the app ships no image files for state.
// Green = tracking, amber = break / idle prompt, grey = clocked out,
// red = signed out or offline.

const COLORS = {
  tracking: [34, 160, 90],
  paused: [224, 160, 32],
  off: [140, 140, 140],
  problem: [210, 60, 60],
} as const;

export type IconState = keyof typeof COLORS;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function dotPng(size: number, [r, g, b]: readonly number[]) {
  const rows: Buffer[] = [];
  const center = (size - 1) / 2;
  const radius = size * 0.42;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center);
      const alpha = Math.max(0, Math.min(1, radius - distance + 0.5));
      row.set([r, g, b, Math.round(alpha * 255)], 1 + x * 4);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const cache = new Map<IconState, NativeImage>();

export function trayIcon(state: IconState): NativeImage {
  let image = cache.get(state);
  if (!image) {
    image = nativeImage.createFromBuffer(dotPng(16, COLORS[state]));
    image.addRepresentation({ scaleFactor: 2, buffer: dotPng(32, COLORS[state]) });
    cache.set(state, image);
  }
  return image;
}
