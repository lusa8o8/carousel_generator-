import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outputDirectory = fileURLToPath(new URL('./', import.meta.url));
await mkdir(outputDirectory, { recursive: true });

await writeFile(new URL('./brand-light-coral.png', import.meta.url), createBoard({
  paper: '#FAFAF5',
  ink: '#151515',
  accent: '#FF5533'
}));
await writeFile(new URL('./brand-dark-lime.png', import.meta.url), createBoard({
  paper: '#121820',
  ink: '#F4F0E6',
  accent: '#B8E51A'
}));
await writeFile(new URL('./brand-plum-rose.png', import.meta.url), createBoard({
  paper: '#F2E9E4',
  ink: '#2D232E',
  accent: '#D7263D'
}));

function createBoard(colors) {
  const width = 720;
  const height = 480;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      let color = colors.paper;
      if (x >= 100 && x < 620 && y >= 130 && y < 300) color = colors.ink;
      if (x >= 530 && x < 650 && y >= 325 && y < 415) color = colors.accent;
      const [r, g, b] = rgb(color);
      const offset = 1 + x * 3;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
    }
    rows.push(row);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function crc32(buffer) {
  let value = 0xFFFFFFFF;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xEDB88320 & -(value & 1));
  }
  return (value ^ 0xFFFFFFFF) >>> 0;
}

function rgb(color) {
  return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
}
