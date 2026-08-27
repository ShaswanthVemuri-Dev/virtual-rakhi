import type { FaceAnchor, WristAnchor } from '../types/vision';
import { lerp, wrappedAngleLerp } from './math';

export interface Retained<T> {
  value: T | null;
  alpha: number;
  state: 'LIVE' | 'HOLDING' | 'FADING' | 'HIDDEN';
}

class BaseRetention<T> {
  protected display: T | null = null;
  protected lastSeen = -Infinity;
  protected wasMissing = false;

  constructor(
    private readonly holdMs = 250,
    private readonly fadeMs = 500,
  ) {}

  protected blend(_from: T, to: T, _t: number): T {
    return to;
  }

  update(next: T | null, now: number): Retained<T> {
    if (next) {
      const reacquire = this.wasMissing;
      this.display = this.display ? this.blend(this.display, next, reacquire ? 0.18 : 0.48) : next;
      this.lastSeen = now;
      this.wasMissing = false;
      return { value: this.display, alpha: 1, state: 'LIVE' };
    }

    this.wasMissing = true;
    if (!this.display) return { value: null, alpha: 0, state: 'HIDDEN' };
    const missingFor = now - this.lastSeen;
    if (missingFor <= this.holdMs) return { value: this.display, alpha: 1, state: 'HOLDING' };
    const alpha = Math.max(0, 1 - (missingFor - this.holdMs) / this.fadeMs);
    if (alpha <= 0) return { value: null, alpha: 0, state: 'HIDDEN' };
    return { value: this.display, alpha, state: 'FADING' };
  }

  reset() {
    this.display = null;
    this.lastSeen = -Infinity;
    this.wasMissing = false;
  }
}

export class FaceRetention extends BaseRetention<FaceAnchor> {
  protected override blend(from: FaceAnchor, to: FaceAnchor, t: number): FaceAnchor {
    return {
      x: lerp(from.x, to.x, t),
      y: lerp(from.y, to.y, t),
      scale: lerp(from.scale, to.scale, t),
      rotation: wrappedAngleLerp(from.rotation, to.rotation, t),
      confidence: to.confidence,
    };
  }
}

export class WristRetention extends BaseRetention<WristAnchor> {
  protected override blend(from: WristAnchor, to: WristAnchor, t: number): WristAnchor {
    const vec3 = (previous: WristAnchor['palmNormal'], next: WristAnchor['palmNormal']) => {
      if (!next) return previous;
      if (!previous) return next;
      return { x: lerp(previous.x, next.x, t), y: lerp(previous.y, next.y, t), z: lerp(previous.z, next.z, t) };
    };
    return {
      x: lerp(from.x, to.x, t),
      y: lerp(from.y, to.y, t),
      scale: lerp(from.scale, to.scale, t),
      angle: wrappedAngleLerp(from.angle, to.angle, t),
      confidence: to.confidence,
      forearmDirection: {
        x: lerp(from.forearmDirection.x, to.forearmDirection.x, t),
        y: lerp(from.forearmDirection.y, to.forearmDirection.y, t),
      },
      wristWidth: to.wristWidth === undefined ? from.wristWidth : from.wristWidth === undefined ? to.wristWidth : lerp(from.wristWidth, to.wristWidth, t),
      palmNormal: vec3(from.palmNormal, to.palmNormal),
      handDirection: vec3(from.handDirection, to.handDirection),
      dorsalFacing: to.dorsalFacing === undefined ? from.dorsalFacing : from.dorsalFacing === undefined ? to.dorsalFacing : lerp(from.dorsalFacing, to.dorsalFacing, t),
    };
  }
}
