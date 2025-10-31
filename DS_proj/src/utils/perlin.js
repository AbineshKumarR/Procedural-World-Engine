// src/utils/perlin.js
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

export function valueNoise2D(x, y, seedNum = 0) {
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

export function fractalNoise2D(x, y, seedNum = 0, octaves = 3, lacunarity = 2, gain = 0.5) {
  let freq = 1;
  let amp = 1;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, y * freq, seedNum + i * 1000) * amp;
    max += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / max;
}

export function seedToNumber(seed) {
  if (typeof seed === 'number') return Math.floor(seed) || 0;
  let s = String(seed || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = (n * 31 + s.charCodeAt(i)) >>> 0;
  }
  return n || 0;
}

/**
 * getTileForWorld: convenience to map world (tile grid) coordinate to discrete tile id.
 * config: { scale, octaves, thresholds: { water, air, dirt } }
 */
export function getTileForWorld(worldX, worldY, seedNum, config = {}) {
  const scale = config.scale ?? 0.08;
  const octaves = config.octaves ?? 3;
  const v = fractalNoise2D(worldX * scale, worldY * scale, seedNum, octaves);
  // thresholds
  const tWater = config.tWater ?? 0.35;
  const tAir = config.tAir ?? 0.5;
  const tDirt = config.tDirt ?? 0.7;
  if (v < tWater) return 3; // water
  if (v < tAir) return 0; // air/grass
  if (v < tDirt) return 1; // dirt
  return 2; // stone
}

export default {
  valueNoise2D,
  fractalNoise2D,
  seedToNumber,
  getTileForWorld,
};
