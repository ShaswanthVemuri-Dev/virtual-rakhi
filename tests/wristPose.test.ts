import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/types/vision';
import { estimateRightWristPose, fuseWristAnchors, RightWristPoseStabilizer } from '../src/vision/wristPose';

const hand = (transform: (point: Vec3) => Vec3 = (point) => point) => {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[0] = { x: 0, y: .055, z: 0 };
  points[5] = { x: -.04, y: -.015, z: 0 };
  points[9] = { x: -.012, y: -.035, z: 0 };
  points[13] = { x: .018, y: -.031, z: 0 };
  points[17] = { x: .045, y: -.008, z: 0 };
  return points.map(transform);
};

const rotateX = (angle: number) => (point: Vec3): Vec3 => ({
  x: point.x,
  y: point.y * Math.cos(angle) - point.z * Math.sin(angle),
  z: point.y * Math.sin(angle) + point.z * Math.cos(angle),
});

describe('right wrist surface pose', () => {
  it('uses landmark translation while preserving the VTO screen rotation', () => {
    const position = { x: .62, y: .41, scale: .2, angle: 0, confidence: .8, forearmDirection: { x: 0, y: -1 }, palmNormal: { x: 0, y: 0, z: -1 } };
    const rotation = { x: .2, y: .3, scale: .12, angle: 1.2, confidence: .9, forearmDirection: { x: 1, y: 0 } };
    const fused = fuseWristAnchors(position, rotation);
    expect(fused?.x).toBe(.62);
    expect(fused?.scale).toBe(.2);
    expect(fused?.angle).toBe(1.2);
    expect(fused?.palmNormal?.z).toBe(-1);
  });

  it('points the dorsal surface toward the camera for a visible knuckle plane', () => {
    const pose = estimateRightWristPose(hand());
    expect(pose).not.toBeNull();
    expect(pose!.dorsal.z).toBeLessThan(-.98);
    expect(Math.abs(pose!.axis.z)).toBeLessThan(.02);
  });

  it('follows a ninety-degree wrist roll instead of remaining camera-facing', () => {
    const pose = estimateRightWristPose(hand(rotateX(Math.PI / 2)));
    expect(pose).not.toBeNull();
    expect(Math.abs(pose!.dorsal.y)).toBeGreaterThan(.98);
    expect(Math.abs(pose!.dorsal.z)).toBeLessThan(.02);
  });

  it('rejects a one-frame 180-degree normal flip', () => {
    const image = hand((point) => ({ x: point.x + .5, y: point.y + .5, z: point.z }));
    const stable = new RightWristPoseStabilizer();
    const first = stable.update({ axis: { x: 0, y: -1, z: 0 }, dorsal: { x: 0, y: 0, z: -1 } }, image, 0);
    const next = stable.update({ axis: { x: 0, y: -1, z: 0 }, dorsal: { x: 0, y: 0, z: 1 } }, image, 55);
    expect(first.dorsal.z).toBeLessThan(-.99);
    expect(next.dorsal.z).toBeLessThan(-.99);
  });
});
