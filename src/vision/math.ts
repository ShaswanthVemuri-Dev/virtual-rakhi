import type { Vec2 } from '../types/vision';

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const normalize = (v: Vec2): Vec2 => {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
};

export const rotate = (v: Vec2, angle: number): Vec2 => ({
  x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
  y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
});

export const wrappedAngleLerp = (from: number, to: number, t: number) => {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
};
