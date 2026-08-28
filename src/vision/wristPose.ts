import type { Vec3 } from '../types/vision';

const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const RING_MCP = 13;
const PINKY_MCP = 17;
const FRAME_POINTS = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP] as const;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (v: Vec3, amount: number): Vec3 => ({ x: v.x * amount, y: v.y * amount, z: v.z * amount });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const unit = (v: Vec3): Vec3 => {
  const magnitude = length(v);
  return magnitude > 1e-7 ? mul(v, 1 / magnitude) : { x: 0, y: 0, z: 0 };
};
const blend = (a: Vec3, b: Vec3, amount: number) => unit(add(mul(a, 1 - amount), mul(b, amount)));
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export interface RightWristPose {
  /** Anatomical wrist-to-knuckles axis in MediaPipe camera coordinates. */
  axis: Vec3;
  /** Normal pointing out through the back/knuckle side of a right hand. */
  dorsal: Vec3;
}

/**
 * Builds an anatomical right-wrist frame from metric world landmarks.
 *
 * Image landmarks deliberately are not used here: their X/Y values are frame
 * ratios while Z uses another scale, so their cross product is not a physical
 * surface normal. Averaging several palm triangles also keeps a closed fist
 * from letting one foreshortened landmark flip the result.
 */
export function estimateRightWristPose(world: Vec3[]): RightWristPose | null {
  if (!FRAME_POINTS.every((index) => world[index])) return null;

  const wrist = world[WRIST];
  const index = world[INDEX_MCP];
  const middle = world[MIDDLE_MCP];
  const ring = world[RING_MCP];
  const pinky = world[PINKY_MCP];
  const knuckleCenter = mul(add(add(index, middle), add(ring, pinky)), .25);
  const rawAxis = unit(sub(knuckleCenter, wrist));
  if (length(rawAxis) < .5) return null;

  const acrossPalm = sub(pinky, index);
  const candidates = [
    cross(acrossPalm, sub(middle, wrist)),
    cross(acrossPalm, sub(ring, wrist)),
    cross(sub(ring, index), sub(middle, wrist)),
  ].map(unit).filter((normal) => length(normal) > .5);
  if (!candidates.length) return null;

  const reference = candidates[0];
  const summed = candidates.reduce((total, candidate) =>
    add(total, dot(reference, candidate) < 0 ? mul(candidate, -1) : candidate), { x: 0, y: 0, z: 0 });
  let dorsal = unit(summed);
  // Gram-Schmidt produces a true surface plane even when the fist is curled.
  const axis = unit(sub(rawAxis, mul(dorsal, dot(rawAxis, dorsal))));
  dorsal = unit(sub(dorsal, mul(axis, dot(dorsal, axis))));
  if (length(axis) < .5 || length(dorsal) < .5) return null;
  return { axis, dorsal };
}

/**
 * Wrist-specific pose stabilizer inspired by virtual-watch try-on filters.
 * It preserves the anatomical normal through edge-on views, rejects a sudden
 * 180-degree solve flip, and still allows deliberate wrist roll.
 */
export class RightWristPoseStabilizer {
  private pose: RightWristPose | null = null;
  private imagePoints: Vec3[] | null = null;
  private timestamp = -Infinity;

  update(candidate: RightWristPose, image: Vec3[], now: number): RightWristPose {
    const points = FRAME_POINTS.map((index) => image[index]).filter(Boolean);
    if (!this.pose || !this.imagePoints || now - this.timestamp > 420 || points.length !== FRAME_POINTS.length) {
      this.pose = candidate;
      this.imagePoints = points;
      this.timestamp = now;
      return candidate;
    }

    let nextAxis = candidate.axis;
    let nextDorsal = candidate.dorsal;
    // Neither anatomical direction can reverse between adjacent camera frames.
    if (dot(this.pose.axis, nextAxis) < 0) nextAxis = mul(nextAxis, -1);
    if (dot(this.pose.dorsal, nextDorsal) < 0) nextDorsal = mul(nextDorsal, -1);

    const motion = Math.sqrt(points.reduce((sum, point, index) => {
      const previous = this.imagePoints?.[index] ?? point;
      return sum + (point.x - previous.x) ** 2 + (point.y - previous.y) ** 2;
    }, 0) / points.length);
    const normalTurn = Math.acos(clamp(dot(this.pose.dorsal, nextDorsal), -1, 1));
    const axisTurn = Math.acos(clamp(dot(this.pose.axis, nextAxis), -1, 1));
    const turn = Math.max(normalTurn, axisTurn);
    const frameSeconds = clamp((now - this.timestamp) / 1000, 1 / 60, .12);
    // About 420 degrees/second is permitted for a real wrist roll. A larger
    // change without matching landmark motion is a pose-solver flip.
    const permittedTurn = .11 + frameSeconds * 7.3 + motion * 10;
    let amount = clamp(.3 + motion * 4.5, .3, .64);
    if (turn > permittedTurn) amount *= clamp(permittedTurn / turn, .08, 1);

    let axis = blend(this.pose.axis, nextAxis, amount);
    let dorsal = blend(this.pose.dorsal, nextDorsal, amount);
    dorsal = unit(sub(dorsal, mul(axis, dot(dorsal, axis))));
    axis = unit(sub(axis, mul(dorsal, dot(axis, dorsal))));
    this.pose = { axis, dorsal };
    this.imagePoints = points;
    this.timestamp = now;
    return this.pose;
  }

  reset() {
    this.pose = null;
    this.imagePoints = null;
    this.timestamp = -Infinity;
  }
}
