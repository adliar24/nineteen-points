const fs = require('fs');
const zlib = require('zlib');

// PNG Decoder for RGBA (ColorType 6, 8-bit)
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
  const bytesPerPixel = (colorType === 6) ? 4 : 3;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * bytesPerPixel);
    for (let x = 0; x < width; x++) {
      const srcIdx = rowStart + 1 + x * bytesPerPixel;
      const dstIdx = (y * width + x) * 4;
      rgba[dstIdx] = uncompressed[srcIdx];
      rgba[dstIdx + 1] = uncompressed[srcIdx + 1];
      rgba[dstIdx + 2] = uncompressed[srcIdx + 2];
      rgba[dstIdx + 3] = (colorType === 6) ? uncompressed[srcIdx + 3] : 255;
    }
  }

  return { width, height, rgba };
}

// PNG Encoder for RGBA (ColorType 6, 8-bit)
function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT: uncompressed scanlines with filter byte 0
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rawRowStart = y * scanlineLength;
    rawData[rawRowStart] = 0; // Filter 0 (None)
    const rgbaRowStart = y * width * 4;
    rgbaBuffer.copy(rawData, rawRowStart + 1, rgbaRowStart, rgbaRowStart + width * 4);
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND
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

// Simple CRC32 implementation for PNG chunks
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

// Resample RGBA image with scaling & centering
function createPaddedIcon(srcImg, targetSize, logoScaleRatio, bgColor = null) {
  const targetBuffer = Buffer.alloc(targetSize * targetSize * 4);

  // If background color provided (e.g. {r, g, b, a}), fill canvas
  if (bgColor) {
    for (let i = 0; i < targetSize * targetSize; i++) {
      targetBuffer[i * 4] = bgColor.r;
      targetBuffer[i * 4 + 1] = bgColor.g;
      targetBuffer[i * 4 + 2] = bgColor.b;
      targetBuffer[i * 4 + 3] = bgColor.a;
    }
  }

  const targetLogoSize = Math.round(targetSize * logoScaleRatio);
  const offsetX = Math.round((targetSize - targetLogoSize) / 2);
  const offsetY = Math.round((targetSize - targetLogoSize) / 2);

  for (let dy = 0; dy < targetLogoSize; dy++) {
    const sy = Math.floor((dy / targetLogoSize) * srcImg.height);
    const targetY = offsetY + dy;
    if (targetY < 0 || targetY >= targetSize) continue;

    for (let dx = 0; dx < targetLogoSize; dx++) {
      const sx = Math.floor((dx / targetLogoSize) * srcImg.width);
      const targetX = offsetX + dx;
      if (targetX < 0 || targetX >= targetSize) continue;

      const srcIdx = (sy * srcImg.width + sx) * 4;
      const dstIdx = (targetY * targetSize + targetX) * 4;

      const srcA = srcImg.rgba[srcIdx + 3] / 255;
      if (srcA <= 0) continue;

      if (!bgColor) {
        // Transparent canvas blend
        const dstA = targetBuffer[dstIdx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA > 0) {
          targetBuffer[dstIdx] = Math.round((srcImg.rgba[srcIdx] * srcA + targetBuffer[dstIdx] * dstA * (1 - srcA)) / outA);
          targetBuffer[dstIdx + 1] = Math.round((srcImg.rgba[srcIdx + 1] * srcA + targetBuffer[dstIdx + 1] * dstA * (1 - srcA)) / outA);
          targetBuffer[dstIdx + 2] = Math.round((srcImg.rgba[srcIdx + 2] * srcA + targetBuffer[dstIdx + 2] * dstA * (1 - srcA)) / outA);
          targetBuffer[dstIdx + 3] = Math.round(outA * 255);
        }
      } else {
        // Blend src over background
        const bgR = targetBuffer[dstIdx];
        const bgG = targetBuffer[dstIdx + 1];
        const bgB = targetBuffer[dstIdx + 2];

        targetBuffer[dstIdx] = Math.round(srcImg.rgba[srcIdx] * srcA + bgR * (1 - srcA));
        targetBuffer[dstIdx + 1] = Math.round(srcImg.rgba[srcIdx + 1] * srcA + bgG * (1 - srcA));
        targetBuffer[dstIdx + 2] = Math.round(srcImg.rgba[srcIdx + 2] * srcA + bgB * (1 - srcA));
        targetBuffer[dstIdx + 3] = 255;
      }
    }
  }

  return encodePng(targetSize, targetSize, targetBuffer);
}

// MAIN EXECUTION
const sourceBuf = fs.readFileSync('public/logo-original-512.png');
const srcImg = decodePng(sourceBuf);

console.log('Source Image loaded:', srcImg.width, 'x', srcImg.height);

// 1. Generate 192x192 padded logo (transparent background, logo size ~65% of canvas)
const logo192Buf = createPaddedIcon(srcImg, 192, 0.65);
fs.writeFileSync('public/logo-192.png', logo192Buf);
console.log('Generated public/logo-192.png (65% logo scale)');

// 2. Generate 512x512 padded logo (transparent background, logo size ~65% of canvas)
const logo512Buf = createPaddedIcon(srcImg, 512, 0.65);
fs.writeFileSync('public/logo-512.png', logo512Buf);
console.log('Generated public/logo-512.png (65% logo scale)');

// 3. Generate 512x512 maskable icon with solid background (#faf9ff) & logo scale ~58% for Android launcher safe-zone
const logoMaskableBuf = createPaddedIcon(srcImg, 512, 0.58, { r: 250, g: 249, b: 255, a: 255 });
fs.writeFileSync('public/logo-maskable-512.png', logoMaskableBuf);
console.log('Generated public/logo-maskable-512.png (58% logo scale + safe zone padding)');

// Replace public/logo.png with the padded version so direct icon references are padded & proportional
fs.writeFileSync('public/logo.png', logo192Buf);
console.log('Updated public/logo.png with padded version');
