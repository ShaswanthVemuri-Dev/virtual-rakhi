import { describe, expect, it } from 'vitest';
import { handsHoldingRakhi, mirrorHandsForCanvas, normalizeHands, pairGuideDistance, rakhiPlacement, restoreHandsToCanvas, retargetHand } from '../src/rakhi/handRetargeting';
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

  it('places and sizes the carried Rakhi directly from the two fingertip pinches', () => {
    const hands = normalizeHands([makeHand(.25), makeHand(.75)]);
    const restored = restoreHandsToCanvas(hands);
    const pinch = (points: typeof restored[number]) => ({
      x: (points[4].x + points[8].x) / 2,
      y: (points[4].y + points[8].y) / 2,
    });
    const [left, right] = restored.map(pinch);
    const placement = rakhiPlacement(hands);
    expect(placement?.center.x).toBeCloseTo((left.x + right.x) / 2, 5);
    expect(placement?.center.y).toBeCloseTo((left.y + right.y) / 2, 5);
    expect(placement?.span).toBeCloseTo(Math.hypot(right.x - left.x, right.y - left.y), 5);
  });

  it('shows the carried Rakhi only for two valid pinches and rejects runaway spans', () => {
    const hands = normalizeHands([makeHand(.35), makeHand(.65)]);
    hands.forEach((current) => { current.localLandmarks[8] = { ...current.localLandmarks[4] }; });
    expect(handsHoldingRakhi(hands)).toBe(true);
    hands[0].localLandmarks[8].x += 1;
    expect(handsHoldingRakhi(hands)).toBe(false);
    expect(rakhiPlacement(normalizeHands([makeHand(.02), makeHand(.98)]))).toBeNull();
  });
});
