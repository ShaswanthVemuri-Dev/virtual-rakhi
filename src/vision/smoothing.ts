import type { Vec3 } from '../types/vision';
import { clamp } from './math';

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / Math.max(dt, 0.0001));
};

export class OneEuroFilter {
  private previousValue: number | null = null;
  private previousDerivative = 0;
  private previousTime: number | null = null;

  constructor(
    private readonly minCutoff = 1.4,
    private readonly beta = 0.035,
    private readonly derivativeCutoff = 1.0,
  ) {}

  reset() {
    this.previousValue = null;
    this.previousDerivative = 0;
    this.previousTime = null;
  }

  filter(value: number, timeMs: number) {
    if (this.previousValue === null || this.previousTime === null) {
      this.previousValue = value;
      this.previousTime = timeMs;
      return value;
    }

    const dt = clamp((timeMs - this.previousTime) / 1000, 1 / 240, 0.25);
    const rawDerivative = (value - this.previousValue) / dt;
    const derivativeAlpha = alpha(this.derivativeCutoff, dt);
    const smoothedDerivative = this.previousDerivative + derivativeAlpha * (rawDerivative - this.previousDerivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDerivative);
    const valueAlpha = alpha(cutoff, dt);
    const filtered = this.previousValue + valueAlpha * (value - this.previousValue);

    this.previousDerivative = smoothedDerivative;
    this.previousValue = filtered;
    this.previousTime = timeMs;
    return filtered;
  }
}

export class LandmarkSmoother {
  private filters = new Map<string, [OneEuroFilter, OneEuroFilter, OneEuroFilter]>();

  smooth(key: string, landmarks: Vec3[], timeMs: number): Vec3[] {
    return landmarks.map((point, index) => {
      const filterKey = `${key}:${index}`;
      let group = this.filters.get(filterKey);
      if (!group) {
        group = [new OneEuroFilter(1.7, 0.045), new OneEuroFilter(1.7, 0.045), new OneEuroFilter(1.2, 0.02)];
        this.filters.set(filterKey, group);
      }
      return {
        x: group[0].filter(point.x, timeMs),
        y: group[1].filter(point.y, timeMs),
        z: group[2].filter(point.z, timeMs),
      };
    });
  }

  clearPrefix(prefix: string) {
    for (const key of this.filters.keys()) {
      if (key.startsWith(prefix)) this.filters.delete(key);
    }
  }

  clear() {
    this.filters.clear();
  }
}

export class RateMeter {
  private samples: number[] = [];

  tick(now: number) {
    this.samples.push(now);
    const cutoff = now - 1000;
    while (this.samples.length && this.samples[0] < cutoff) this.samples.shift();
  }

  get fps() {
    return this.samples.length;
  }

  reset() {
    this.samples = [];
  }
}
