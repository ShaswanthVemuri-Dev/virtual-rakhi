import { describe, expect, it } from 'vitest';
import { FaceRetention, WristRetention } from '../src/vision/trackingRetention';

const anchor = { x: 0.5, y: 0.3, scale: 0.04, rotation: 0, confidence: 0.95 };

describe('tracking retention', () => {
  it('holds, fades, hides, and reacquires instead of floating forever', () => {
    const retention = new FaceRetention(250, 500);
    expect(retention.update(anchor, 0).state).toBe('LIVE');
    expect(retention.update(null, 100).state).toBe('HOLDING');
    expect(retention.update(null, 600).state).toBe('FADING');
    const hidden = retention.update(null, 900);
    expect(hidden.state).toBe('HIDDEN');
    expect(hidden.value).toBeNull();
    expect(retention.update({ ...anchor, x: 0.55 }, 1000).state).toBe('LIVE');
  });

  it('retains the full 3D wrist orientation without adding live-frame lag', () => {
    const retention = new WristRetention();
    const first = { x: .5, y: .5, scale: .2, angle: 0, confidence: .9, forearmDirection: { x: 1, y: 0 }, wristWidth: .08, palmNormal: { x: 0, y: 0, z: -1 }, handDirection: { x: 1, y: 0, z: 0 }, dorsalFacing: .9 };
    retention.update(first, 0);
    const next = retention.update({ ...first, x: .52, dorsalFacing: .7 }, 16);
    expect(next.value?.palmNormal).toBeDefined();
    expect(next.value?.handDirection).toBeDefined();
    expect(next.value?.wristWidth).toBeGreaterThan(0);
    expect(next.value?.x).toBe(.52);
    expect(next.value?.dorsalFacing).toBe(.7);
  });

  it('does not interpolate through zero when a pose solver flips its normal', () => {
    const retention = new WristRetention();
    const first = { x: .5, y: .5, scale: .2, angle: 0, confidence: .9, forearmDirection: { x: 0, y: -1 }, palmNormal: { x: 0, y: 0, z: -1 }, handDirection: { x: 0, y: -1, z: 0 } };
    retention.update(first, 0);
    const next = retention.update({ ...first, palmNormal: { x: 0, y: 0, z: 1 } }, 16);
    expect(next.value?.palmNormal?.z).toBeLessThan(-.99);
  });

  it('keeps the Google wrist position through brief missed inferences', () => {
    const retention = new WristRetention();
    const wrist = { x: .62, y: .44, scale: .18, angle: 0, confidence: .9, forearmDirection: { x: 0, y: -1 }, wristWidth: .075 };
    retention.update(wrist, 0);
    expect(retention.update(null, 180).value).toEqual(wrist);
    expect(retention.update(null, 900).value?.x).toBe(.62);
    expect(retention.update(null, 1_250).value).toBeNull();
  });
});
