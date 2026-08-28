import { describe, expect, it } from 'vitest';
import { mirrorHandsForCanvas, normalizeHands, pairGuideDistance, restoreHandsToCanvas, retargetHand } from '../src/rakhi/handRetargeting';
import type { TrackedHand } from '../src/types/vision';

const makeHand = (offsetX: number): TrackedHand => {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({
    x: offsetX + (index % 4) * 0.012,
    y: 0.6 - Math.floor(index / 4) * 0.018,
    z: 0,
  }));
  landmarks[0] = { x: offsetX, y: 0.6, z: 0 };
  landmarks[9] = { x: offsetX, y: 0.5, z: 0 };
  return { id: `hand-${offsetX}`, handedness: 'Left', confidence: 0.95, landmarks };
};

describe('hand normalization / retargeting', () => {
  it('normalizes palm geometry and produces 21 retargeted joints', () => {
    const normalized = normalizeHands([makeHand(0.4)]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].localLandmarks).toHaveLength(21);
    expect(Math.abs(normalized[0].localLandmarks[9].x - 1)).toBeLessThan(0.001);

    const output = retargetHand(normalized[0], {
      x: 0.5,
      y: 0.5,
      palmScale: 0.1,
      angle: 0,
      sourceGuide: normalized[0].pairCenter,
    });
    expect(output).toHaveLength(21);
    expect(output[0].x).toBeCloseTo(0.5, 4);
    expect(output[0].y).toBeCloseTo(0.5, 4);
  });

  it('preserves two-hand spacing and a shared pair center', () => {
    const normalized = normalizeHands([makeHand(0.35), makeHand(0.65)]);
    expect(Math.abs(normalized[0].workspaceOffset.x)).toBeGreaterThan(0);
    expect(Math.abs(normalized[1].workspaceOffset.x)).toBeGreaterThan(0);
    expect(Math.sign(normalized[0].workspaceOffset.x)).not.toBe(Math.sign(normalized[1].workspaceOffset.x));
    expect(normalized[0].pairCenter).toEqual(normalized[1].pairCenter);
  });

  it('restores transmitted hands to their original canvas positions', () => {
    const source = [makeHand(.35), makeHand(.65)];
    const restored = restoreHandsToCanvas(normalizeHands(source));
    expect(restored[0][0].x).toBeCloseTo(source[0].landmarks[0].x, 4);
    expect(restored[0][9].y).toBeCloseTo(source[0].landmarks[9].y, 4);
    expect(restored[1][0].x).toBeCloseTo(source[1].landmarks[0].x, 4);
  });

  it('uses the giver mirrored preview as the shared presentation space', () => {
    const source = [makeHand(.2)];
    const restored = restoreHandsToCanvas(mirrorHandsForCanvas(source));
    expect(restored[0][0].x).toBeCloseTo(.8, 4);
    expect(restored[0][9].x).toBeCloseTo(1 - source[0].landmarks[9].x, 4);
  });

  it('maps pair movement toward the central giver guide', () => {
    const centered = normalizeHands([makeHand(0.42), makeHand(0.58)]);
    const offCenter = normalizeHands([makeHand(0.2), makeHand(0.36)]);
    expect(pairGuideDistance(centered)).toBeLessThan(pairGuideDistance(offCenter));
  });
});
