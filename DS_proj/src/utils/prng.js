// src/utils/prng.js
// Small seeded PRNG (mulberry32) for deterministic experiments
export function mulberry32(seed) {
  // accepts number seed (32-bit)
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// convert string seed to number deterministically
export function seedStringToNumber(s) {
  s = String(s || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = (n * 31 + s.charCodeAt(i)) >>> 0;
  }
  return n || 1;
}
