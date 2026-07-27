import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function extractPngPalette(base64, maximumColors = 8) {
  const buffer = Buffer.from(String(base64 || ''), 'base64');
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const compressed = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (!width || !height || bitDepth !== 8 || !channels || !compressed.length) return null;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(compressed));
  if (raw.length < (stride + 1) * height) return null;

  const counts = new Map();
  let previous = Buffer.alloc(stride);
  let position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++];
    const source = raw.subarray(position, position + stride);
    position += stride;
    const row = unfilter(source, previous, filter, channels);
    for (let x = 0; x < width; x++) {
      const pixel = x * channels;
      if (channels === 4 && row[pixel + 3] < 128) continue;
      const key = `${row[pixel]},${row[pixel + 1]},${row[pixel + 2]}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    previous = row;
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const colors = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maximumColors)
    .map(([key, count]) => ({
      hex: `#${key.split(',').map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
      ratio: Number((count / total).toFixed(6))
    }));
  return { width, height, colors };
}

function unfilter(source, previous, filter, bytesPerPixel) {
  const row = Buffer.alloc(source.length);
  for (let index = 0; index < source.length; index++) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const above = previous[index] || 0;
    const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    let predictor = 0;
    if (filter === 1) predictor = left;
    else if (filter === 2) predictor = above;
    else if (filter === 3) predictor = Math.floor((left + above) / 2);
    else if (filter === 4) predictor = paeth(left, above, upperLeft);
    else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`);
    row[index] = (source[index] + predictor) & 0xFF;
  }
  return row;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}
