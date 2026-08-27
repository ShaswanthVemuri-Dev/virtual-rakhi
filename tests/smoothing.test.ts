import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from '../src/vision/smoothing';

describe('OneEuroFilter', () => {
  it('reduces a sudden jump without freezing motion', () => {
    const filter = new OneEuroFilter(1.2, 0.04);
    const first = filter.filter(0, 0);
    const second = filter.filter(1, 16.7);
    expect(first).toBe(0);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(1);
  });
});
