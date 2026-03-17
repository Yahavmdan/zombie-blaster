import sharp from 'sharp';

const img = sharp('Special-sprites/draggon.png');
const { width, height } = await img.metadata();
console.log(`Image: ${width}x${height}`);

const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const ch = info.channels;

// Find non-transparent rows
const rowHasContent = [];
for (let y = 0; y < h; y++) {
  let hasPixel = false;
  for (let x = 0; x < w; x++) {
    const alpha = data[(y * w + x) * ch + 3];
    if (alpha > 10) { hasPixel = true; break; }
  }
  rowHasContent.push(hasPixel);
}

// Find row bands (groups of consecutive rows with content)
const bands = [];
let inBand = false;
let bandStart = 0;
for (let y = 0; y <= h; y++) {
  const hasContent = y < h && rowHasContent[y];
  if (hasContent && !inBand) {
    bandStart = y;
    inBand = true;
  } else if (!hasContent && inBand) {
    bands.push({ startY: bandStart, endY: y - 1, height: y - bandStart });
    inBand = false;
  }
}

console.log(`\nFound ${bands.length} content bands:\n`);
for (let i = 0; i < bands.length; i++) {
  const b = bands[i];

  // Find frames in this band by looking for vertical gaps
  const colHasContent = [];
  for (let x = 0; x < w; x++) {
    let hasPixel = false;
    for (let y = b.startY; y <= b.endY; y++) {
      const alpha = data[(y * w + x) * ch + 3];
      if (alpha > 10) { hasPixel = true; break; }
    }
    colHasContent.push(hasPixel);
  }

  const frames = [];
  let inFrame = false;
  let frameStart = 0;
  for (let x = 0; x <= w; x++) {
    const has = x < w && colHasContent[x];
    if (has && !inFrame) {
      frameStart = x;
      inFrame = true;
    } else if (!has && inFrame) {
      frames.push({ x: frameStart, w: x - frameStart });
      inFrame = false;
    }
  }

  console.log(`Band ${i}: y=${b.startY}..${b.endY} (h=${b.height}), ${frames.length} frames`);
  for (const f of frames) {
    console.log(`  frame: x=${f.x}, w=${f.w}`);
  }
}
