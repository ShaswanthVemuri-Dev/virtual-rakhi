import { describe, expect, it } from 'vitest';
import { FaceRetention } from '../src/vision/trackingRetention';

const anchor = { x: 0.5, y: 0.3, scale: 0.04, rotation: 0, confidence: 0.95 };

describe('tracking retention', () => {
  it('holds, fades, hides, and reacquires instead of floating forever', () => {
    const retention = new FaceRetention(250, 500);
    expect(retention.update(anchor, 0).state).toBe('LIVE');
    expect(retention.update(null, 100).state).toBe('HOLDING');
    expect(retention.update(null, 600).state).toBe('FADING');
    expect(retention.update(null, 900).state).toBe('HIDDEN');
    expect(retention.update({ ...anchor, x: 0.55 }, 1000).state).toBe('LIVE');
  });
});
