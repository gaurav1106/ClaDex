const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const size = 256;
const png = new PNG({ width: size, height: size });

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

const bg = hexToRgb('#241f1a');
const accent = hexToRgb('#d97757');
const accentDark = hexToRgb('#9f432a');
const highlight = hexToRgb('#fff4e8');

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const idx = (size * y + x) << 2;
    const dx = x - size / 2;
    const dy = y - size / 2;
    const corner = Math.hypot(Math.max(Math.abs(dx) - 94, 0), Math.max(Math.abs(dy) - 94, 0));
    const insideBg = corner <= 28;
    png.data[idx] = insideBg ? bg.r : 0;
    png.data[idx + 1] = insideBg ? bg.g : 0;
    png.data[idx + 2] = insideBg ? bg.b : 0;
    png.data[idx + 3] = insideBg ? 255 : 0;
  }
}

function blendPixel(x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const idx = (size * y + x) << 2;
  const baseAlpha = png.data[idx + 3] / 255;
  const outAlpha = alpha + baseAlpha * (1 - alpha);
  png.data[idx] = Math.round((color.r * alpha + png.data[idx] * baseAlpha * (1 - alpha)) / outAlpha);
  png.data[idx + 1] = Math.round((color.g * alpha + png.data[idx + 1] * baseAlpha * (1 - alpha)) / outAlpha);
  png.data[idx + 2] = Math.round((color.b * alpha + png.data[idx + 2] * baseAlpha * (1 - alpha)) / outAlpha);
  png.data[idx + 3] = Math.round(outAlpha * 255);
}

function ellipse(cx, cy, rx, ry, color, alpha = 1) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const value = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (value <= 1) blendPixel(x, y, color, alpha * Math.min(1, (1 - value) * 8));
    }
  }
}

function dropletMask(x, y) {
  return ((x - 128) / 74) ** 2 + ((y - 128) / 74) ** 2 <= 1;
}

for (let y = 48; y < 208; y += 1) {
  for (let x = 48; x < 208; x += 1) {
    if (dropletMask(x, y)) {
      const idx = (size * y + x) << 2;
      const shade = Math.min(1, Math.max(0, (y - 58) / 150));
      const shine = Math.max(0, 1 - Math.hypot(x - 100, y - 82) / 116) * 0.42;
      const r = accent.r * (1 - shade) + accentDark.r * shade;
      const g = accent.g * (1 - shade) + accentDark.g * shade;
      const b = accent.b * (1 - shade) + accentDark.b * shade;
      png.data[idx] = Math.round(r * (1 - shine) + highlight.r * shine);
      png.data[idx + 1] = Math.round(g * (1 - shine) + highlight.g * shine);
      png.data[idx + 2] = Math.round(b * (1 - shine) + highlight.b * shine);
      png.data[idx + 3] = 255;
    }
  }
}

ellipse(102, 83, 17, 23, highlight, 0.82);
ellipse(122, 104, 9, 11, highlight, 0.24);

fs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true });
const pngBytes = PNG.sync.write(png);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), pngBytes);

const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt8(0, 6);
icoHeader.writeUInt8(0, 7);
icoHeader.writeUInt8(0, 8);
icoHeader.writeUInt8(0, 9);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(pngBytes.length, 14);
icoHeader.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.ico'), Buffer.concat([icoHeader, pngBytes]));
