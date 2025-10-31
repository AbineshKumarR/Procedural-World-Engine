// src/__tests__/spatial.test.js
import { describe, it, expect } from 'vitest';
import SpatialHashGrid from '../spatial/SpatialHashGrid';
import Quadtree from '../spatial/Quadtree';

function bruteForceQuery(entities, range) {
  const out = [];
  for (const e of entities) {
    const ea = { minX: e.x - e.r, minY: e.y - e.r, maxX: e.x + e.r, maxY: e.y + e.r };
    if (
      !(
        ea.maxX < range.minX ||
        ea.minX > range.maxX ||
        ea.maxY < range.minY ||
        ea.minY > range.maxY
      )
    )
      out.push(e.id);
  }
  return out;
}

function makeEntities(n = 50, seed = 123) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: i + 1, x: (i * 37) % 300, y: (i * 61) % 300, r: 4 + (i % 5) });
  }
  return out;
}

describe('spatial indexes basic correctness', () => {
  const entities = makeEntities(50);
  it('SpatialHashGrid query matches brute-force', () => {
    const grid = new SpatialHashGrid(32);
    grid.rebuild(entities);
    const range = { minX: 10, minY: 10, maxX: 200, maxY: 200 };
    const g = grid.queryRange(range).sort((a, b) => a - b);
    const br = bruteForceQuery(entities, range).sort((a, b) => a - b);
    expect(g).toEqual(br);
  });

  it('Quadtree query matches brute-force', () => {
    const qt = new Quadtree({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }, 6, 6);
    qt.rebuild(entities);
    const range = { minX: 10, minY: 10, maxX: 200, maxY: 200 };
    const q = qt.queryRange(range).sort((a, b) => a - b);
    const br = bruteForceQuery(entities, range).sort((a, b) => a - b);
    expect(q).toEqual(br);
  });
});
