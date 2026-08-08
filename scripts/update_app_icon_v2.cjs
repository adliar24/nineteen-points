const fs = require('fs');
const zlib = require('zlib');

const srcGambar2 = 'C:\\Users\\ADLI\\.gemini\\antigravity-ide\\brain\\3be8f4e4-ecb7-4ce4-adba-e67e72229f3a\\media__1786199316292.png';

console.log('Loading newly uploaded Gambar 2 (White Eagle on Purple)...');

function decodePng(buf) {
  let offset = 8;
  let width, height, bitDepth, colorType;
  let idatChunks = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
      bitDepth = buf[offset + 16];
      colorType = buf[offset + 17];
    } else if (type === 'IDAT') {
      idatChunks.push(buf.slice(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }

  const uncompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  const bytesPerPixel = (colorType === 6) ? 4 : (colorType === 2 ? 3 : 1);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * bytesPerPixel);
    for (let x = 0; x < width; x++) {
      const srcIdx = rowStart + 1 + x * bytesPerPixel;
      const dstIdx = (y * width + x) * 4;
      if (colorType === 6) {
        rgba[dstIdx] = uncompressed[srcIdx];
        rgba[dstIdx + 1] = uncompressed[srcIdx + 1];
        rgba[dstIdx + 2] = uncompressed[srcIdx + 2];
        rgba[dstIdx + 3] = uncompressed[srcIdx + 3];
      } else if (colorType === 2) {
        rgba[dstIdx] = uncompressed[srcIdx];
        rgba[dstIdx + 1] = uncompressed[srcIdx + 1];
        rgba[dstIdx + 2] = uncompressed[srcIdx + 2];
        rgba[dstIdx + 3] = 255;
      }
    }
  }

  return { width, height, rgba };
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = createChunk('IHDR', ihdr);

  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rawRowStart = y * scanlineLength;
    rawData[rawRowStart] = 0;
    const rgbaRowStart = y * width * 4;
    rgbaBuffer.copy(rawData, rawRowStart + 1, rgbaRowStart, rgbaRowStart + width * 4);
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(12 + len);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.slice(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function resizeImage(srcImg, targetSize) {
  const targetBuffer = Buffer.alloc(targetSize * targetSize * 4);
  for (let dy = 0; dy < targetSize; dy++) {
    const sy = Math.floor((dy / targetSize) * srcImg.height);
    for (let dx = 0; dx < targetSize; dx++) {
      const sx = Math.floor((dx / targetSize) * srcImg.width);
      const srcIdx = (sy * srcImg.width + sx) * 4;
      const dstIdx = (dy * targetSize + dx) * 4;
      targetBuffer[dstIdx] = srcImg.rgba[srcIdx];
      targetBuffer[dstIdx + 1] = srcImg.rgba[srcIdx + 1];
      targetBuffer[dstIdx + 2] = srcImg.rgba[srcIdx + 2];
      targetBuffer[dstIdx + 3] = srcImg.rgba[srcIdx + 3];
    }
  }
  return encodePng(targetSize, targetSize, targetBuffer);
}

const img2Buf = fs.readFileSync(srcGambar2);
const img2Parsed = decodePng(img2Buf);

console.log('Gambar 2 dimensions:', img2Parsed.width, 'x', img2Parsed.height);

const icon192 = resizeImage(img2Parsed, 192);
const icon512 = resizeImage(img2Parsed, 512);

// Overwrite all app icon targets in public directory with Gambar 2
fs.writeFileSync('public/app-icon.png', icon512);
fs.writeFileSync('public/logo-192.png', icon192);
fs.writeFileSync('public/logo-512.png', icon512);
fs.writeFileSync('public/logo-maskable-512.png', icon512);
fs.writeFileSync('public/logo-original-512.png', icon512);
fs.writeFileSync('public/favicon.png', icon192);
fs.writeFileSync('public/apple-touch-icon.png', icon192);

console.log('Successfully replaced ALL app icons with Gambar 2!');
