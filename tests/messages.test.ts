import { describe, expect, it } from 'vitest';
import { compactHands, isCeremonyMessage } from '../src/rtc/messages';
import type { NormalizedHand } from '../src/types/vision';

describe('RTC ceremony messages', () => {
  it('rejects unknown/unstructured data channel input', () => {
    expect(isCeremonyMessage(null)).toBe(false);
    expect(isCeremonyMessage({ type: 'DELETE_EVERYTHING' })).toBe(false);
    expect(isCeremonyMessage({ type: 'BLESSING', timestamp: 1, target: 'GIVER' })).toBe(true);
  });

  it('rounds high-frequency hand packets without changing articulation', () => {
    const hand: NormalizedHand = {
      id: 'left', handedness: 'Left', confidence: 0.9123456,
      localLandmarks: [{ x: 0.123456, y: -0.654321, z: 0.000019 }],
      palmScale: 0.123456, palmAngle: 1.234567,
      wrist: { x: 0.2, y: 0.3 }, workspaceOffset: { x: -0.4, y: 0.5 },
      pairCenter: { x: 0.51, y: 0.49 }, pairScale: 0.111111,
    };
    const [packet] = compactHands([hand]);
    expect(packet.confidence).toBe(0.9123);
    expect(packet.localLandmarks[0]).toEqual({ x: 0.1235, y: -0.6543, z: 0 });
    expect(packet.handedness).toBe('Left');
  });
});
