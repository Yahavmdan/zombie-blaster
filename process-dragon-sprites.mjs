import sharp from 'sharp';

async function processSheet(inputPath, outputPath, minWidth = 20) {
  const inputBuf = await sharp(inputPath).toBuffer();
  const meta = await sharp(inputBuf).metadata();
  const { data, info } = await sharp(inputBuf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;

  const colHasContent = [];
  for (let x = 0; x < w; x++) {
    let has = false;
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * ch + 3] > 10) { has = true; break; }
    }
    colHasContent.push(has);
  }

  const frames = [];
  let inF = false, start = 0;
  for (let x = 0; x <= w; x++) {
    const has = x < w && colHasContent[x];
    if (has && !inF) { start = x; inF = true; }
    else if (!has && inF) {
      if (x - start >= minWidth) frames.push({ x: start, w: x - start });
      inF = false;
    }
  }

  if (frames.length === 0) {
    console.log(`${inputPath}: no frames detected!`);
    return null;
  }

  const maxW = Math.max(...frames.map(f => f.w));

  const composites = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const frameBuf = await sharp(inputBuf)
      .extract({ left: f.x, top: 0, width: f.w, height: h })
      .png().toBuffer();
    composites.push({
      input: frameBuf,
      left: i * maxW + Math.floor((maxW - f.w) / 2),
      top: 0,
    });
  }

  const totalW = maxW * frames.length;
  await sharp({
    create: { width: totalW, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png().toFile(outputPath);

  console.log(`${outputPath}: ${frames.length} frames, ${maxW}x${h} per cell, ${totalW}x${h} total`);
  return { frameCount: frames.length, frameWidth: maxW, height: h };
}

const outDir = 'public/sprites/zombies/dragon_boss';

await processSheet('Special-sprites/flying.png', `${outDir}/Flying.png`);
await processSheet('Special-sprites/apiral-attack.png', `${outDir}/SpiralAttack.png`);
await processSheet('Special-sprites/dying.png', `${outDir}/Dead.png`);
await processSheet('Special-sprites/getting-hit.png', `${outDir}/Hurt.png`, 10);
await processSheet('Special-sprites/attack-effect-1.png', `${outDir}/AttackEffect1.png`, 15);
await processSheet('Special-sprites/attack-effect-2.png', `${outDir}/AttackEffect2.png`, 15);
