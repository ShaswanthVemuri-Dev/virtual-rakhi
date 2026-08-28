import { describe, expect, it } from 'vitest';
import { RakhiTyingMachine } from '../src/rakhi/tyingStateMachine';
import type { NormalizedHand, WristAnchor } from '../src/types/vision';

const wrist: WristAnchor = { x: 0.5, y: 0.55, scale: 0.16, angle: 0, confidence: 0.92, forearmDirection: { x: 0, y: 1 } };

const makeHands = (centerX: number, separation: number, pinching = false): NormalizedHand[] => {
  const palmScale = 0.08;
  return [-1, 1].map((sign, index) => ({
    id: `h${index}`,
    handedness: index === 0 ? 'Left' : 'Right',
    confidence: 0.94,
    localLandmarks: Array.from({ length: 21 }, (_, landmark) => ({ x: landmark === 8 ? (pinching ? 0.1 : 0.9) : landmark === 4 ? 0.1 : 0, y: 0, z: 0 })),
    palmScale,
    palmAngle: 0,
    wrist: { x: centerX + sign * separation / 2, y: 0.55 },
    workspaceOffset: { x: sign * (separation / 2) / palmScale, y: 0 },
    pairCenter: { x: centerX, y: 0.55 },
    pairScale: palmScale,
  })) as NormalizedHand[];
};

describe('RakhiTyingMachine', () => {
  it('requires stable wrist, two pinch gestures, and wrist approach before attachment', () => {
    const machine = new RakhiTyingMachine();
    expect(machine.start().state).toBe('WAIT_FOR_RECEIVER_WRIST');
    machine.update(0, wrist, []);
    const captured = machine.update(140, wrist, []);
    expect(captured.state).toBe('WAIT_FOR_GIVER_HANDS');
    expect(captured.captureWrist).toBeTruthy();

    expect(machine.update(500, wrist, makeHands(0.25, 0.3)).state).toBe('POSITIONING');
    expect(machine.update(600, wrist, makeHands(0.25, 0.3, true)).state).toBe('APPROACHING_WRIST');
    expect(machine.update(700, wrist, makeHands(0.5, 0.3, true)).state).toBe('ALIGNMENT_VALID');
    expect(machine.update(850, wrist, makeHands(0.5, 0.3, true)).state).toBe('FINISHING_ANIMATION');
    expect(machine.update(1080, wrist, makeHands(0.5, 0.3, true)).attachedNow).toBe(true);
    expect(machine.getState()).toBe('RAKHI_ATTACHED');
  });

  it('does not complete from a single accidental closed-hand frame', () => {
    const machine = new RakhiTyingMachine();
    machine.start();
    machine.update(0, wrist, []);
    machine.update(140, wrist, []);
    machine.update(500, wrist, makeHands(0.5, 0.08));
    expect(machine.getState()).toBe('POSITIONING');
    expect(machine.update(1200, wrist, makeHands(0.5, 0.08)).state).toBe('POSITIONING');
  });

  it('returns to wrist acquisition when the live receiver wrist is lost in Phase 3', () => {
    const machine = new RakhiTyingMachine();
    machine.start();
    machine.update(0, wrist, [], true);
    expect(machine.update(140, wrist, [], true).state).toBe('WAIT_FOR_GIVER_HANDS');
    expect(machine.update(500, null, makeHands(0.5, 0.3, true), true).state).toBe('WAIT_FOR_RECEIVER_WRIST');
  });
});
