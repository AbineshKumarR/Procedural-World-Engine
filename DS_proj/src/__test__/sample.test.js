import { describe, it, expect } from 'vitest';
import { noise2D } from '../utils/perlin';

describe('perlin placeholder', () => {
  it('returns a value between 0 and 1', () => {
    const v = noise2D(12.3, 45.6);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
