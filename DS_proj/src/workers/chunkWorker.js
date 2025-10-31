function fract(x) {
  return x - Math.floor(x);
}
function hash2(x, y, seedNum) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seedNum * 101.7) * 43758.5453123;
  return fract(s);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function fade(t) {
  return t * t * (3 - 2 * t);
}
function valueNoise2D(x, y, seedNum = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = x - x0;
  const sy = y - y0;
  const n00 = hash2(x0, y0, seedNum);
  const n10 = hash2(x0 + 1, y0, seedNum);
  const n01 = hash2(x0, y0 + 1, seedNum);
  const n11 = hash2(x0 + 1, y0 + 1, seedNum);
  const ix0 = lerp(n00, n10, fade(sx));
  const ix1 = lerp(n01, n11, fade(sx));
  return lerp(ix0, ix1, fade(sy));
}
function fractalNoise2D(x, y, seedNum = 0, octaves = 3, lacunarity = 2, gain = 0.5) {
  let freq = 1,
    amp = 1,
    sum = 0,
    max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, y * freq, seedNum + i * 1000) * amp;
    max += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return max === 0 ? 0 : sum / max;
}

self.onmessage = function (e) {
  try {
    const data = e.data;
    if (!data || data.cmd !== 'generate') return;
    const { jobId, args } = data;
    const { cx, cy, chunkSize, tileSize, seedNum, noiseConfig } = args;
    const tiles = new Uint8Array(chunkSize * chunkSize);

    const scale = (noiseConfig && noiseConfig.scale) || 0.08;
    const octaves = (noiseConfig && noiseConfig.octaves) || 3;

    for (let ty = 0; ty < chunkSize; ty++) {
      for (let tx = 0; tx < chunkSize; tx++) {
        const worldX = cx * chunkSize + tx;
        const worldY = cy * chunkSize + ty;
        const v = fractalNoise2D(worldX * scale, worldY * scale, seedNum, octaves);
        let tile = 0;
        if (v < 0.35) tile = 3;
        else if (v < 0.5) tile = 0;
        else if (v < 0.7) tile = 1;
        else tile = 2;
        tiles[ty * chunkSize + tx] = tile;
      }
    }

    self.postMessage(
      { cmd: 'generated', jobId, args: { cx, cy, chunkSize, tileSize, seedNum, tiles } },
      [tiles.buffer]
    );
  } catch (err) {
    self.postMessage({ cmd: 'error', error: String(err), stack: err && err.stack });
  }
};
