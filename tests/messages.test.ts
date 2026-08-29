import { describe, expect, it } from 'vitest';
import { canReceiveMessage, compactHands, isCeremonyMessage } from '../src/rtc/messages';
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
      aspect: 16 / 9,
    };
    const [packet] = compactHands([hand]);
    expect(packet.confidence).toBe(0.9123);
    expect(packet.localLandmarks[0]).toEqual({ x: 0.1235, y: -0.6543, z: 0 });
    expect(packet.handedness).toBe('Left');
  });

  it('assigns initialization to the host and enforces sender roles', () => {
    expect(canReceiveMessage({ type: 'JOIN_READY' }, 'GIVER', true, false)).toBe(true);
    expect(canReceiveMessage({ type: 'JOIN_READY' }, 'RECEIVER', false, false)).toBe(false);
    expect(canReceiveMessage({ type: 'RAKHI_ATTACHED', timestamp: 1 }, 'RECEIVER', false, true)).toBe(true);
    expect(canReceiveMessage({ type: 'WRIST_ANCHOR', payload: null }, 'GIVER', false, true)).toBe(true);
    expect(canReceiveMessage({ type: 'WRIST_ANCHOR', payload: null }, 'RECEIVER', true, true)).toBe(false);
    expect(canReceiveMessage({ type: 'TRACKING_READY' }, 'GIVER', true, true)).toBe(true);
    expect(canReceiveMessage({ type: 'TRACKING_READY' }, 'RECEIVER', false, true)).toBe(false);
    expect(canReceiveMessage({ type: 'BLESSING', timestamp: 1, target: 'GIVER' }, 'GIVER', true, true)).toBe(true);
    expect(canReceiveMessage({ type: 'BLESSING', timestamp: 1, target: 'RECEIVER' }, 'GIVER', true, true)).toBe(false);
  });

  it('rejects out-of-frame and unbounded tracking values', () => {
    expect(isCeremonyMessage({ type: 'WRIST_ANCHOR', payload: { x: 99, y: .5, scale: .1, angle: 0, confidence: .9, forearmDirection: { x: 0, y: 1 } } })).toBe(false);
  });
});
