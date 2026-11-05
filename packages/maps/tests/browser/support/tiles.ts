import { deflateSync } from 'node:zlib';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length);
  header.write(type, 4);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
  return Buffer.concat([header, data, checksum]);
}
/** Synthetic PNG crosshair positioned only from the checked-in PostGIS oracle. */
export function oracleTile(
  bbox: number[],
  point: readonly number[],
  color: readonly number[],
  radius: number
): Buffer {
  const size = 256;
  const data = Buffer.alloc((size * 4 + 1) * size);
  const cx = ((point[0] - bbox[0]) / (bbox[2] - bbox[0])) * size;
  const cy = ((bbox[3] - point[1]) / (bbox[3] - bbox[1])) * size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x + 0.5 - cx),
        dy = Math.abs(y + 0.5 - cy);
      if ((dx <= 1 && dy <= radius) || (dy <= 1 && dx <= radius)) {
        const offset = y * (size * 4 + 1) + 1 + x * 4;
        for (let channel = 0; channel < 3; channel++)
          data[offset + channel] = color[channel];
        data[offset + 3] = 255;
      }
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(data)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
export function tileBbox(z: number, x: number, y: number): number[] {
  const span = 10_000_000 / 2 ** z;
  return [
    x * span,
    10_000_000 - (y + 1) * span,
    (x + 1) * span,
    10_000_000 - y * span
  ];
}
const varint = (value: number): number[] => {
  const bytes: number[] = [];
  do {
    bytes.push((value & 127) | (value > 127 ? 128 : 0));
    value = Math.floor(value / 128);
  } while (value);
  return bytes;
};
const field = (tag: number, data: number[]): number[] => [
  ...varint(tag * 8 + 2),
  ...varint(data.length),
  ...data
];
/** Minimal valid MVT point, encoded in a non-Mercator grid; no third-party encoder. */
export function oracleVectorTile(
  bbox: number[],
  point: readonly number[]
): Buffer {
  const x = Math.round(((point[0] - bbox[0]) / (bbox[2] - bbox[0])) * 4096);
  const y = Math.round(((bbox[3] - point[1]) / (bbox[3] - bbox[1])) * 4096);
  const feature =
    x < 0 || y < 0 || x > 4096 || y > 4096
      ? []
      : field(2, [
          8,
          1,
          24,
          1,
          ...field(4, [9, ...varint(x * 2), ...varint(y * 2)])
        ]);
  return Buffer.from(
    field(3, [
      ...field(1, [...Buffer.from('sites')]),
      ...feature,
      40,
      ...varint(4096),
      120,
      2
    ])
  );
}
