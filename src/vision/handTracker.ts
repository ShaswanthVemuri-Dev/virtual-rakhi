import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedHand, TrackedHand } from '../types/vision';
import { LandmarkSmoother, RateMeter } from './smoothing';
import { createHandLandmarker } from './modelFactory';
import { normalizeHands } from '../rakhi/handRetargeting';

export class HandTracker {
  private detector: HandLandmarker | null = null;
  private lastInference = -Infinity;
  private readonly intervalMs = 1000 / 27;
  private readonly smoother = new LandmarkSmoother();
  readonly rate = new RateMeter();

  async init() {
    if (!this.detector) this.detector = await createHandLandmarker();
  }

  async process(video: HTMLVideoElement, now: number): Promise<{ hands: TrackedHand[]; normalizedHands: NormalizedHand[] } | null> {
    if (!this.detector || now - this.lastInference < this.intervalMs || video.readyState < 2) return null;
    this.lastInference = now;
    const result = this.detector.detectForVideo(video, now);
    this.rate.tick(now);

    const hands: TrackedHand[] = (result.landmarks ?? []).map((landmarks: Array<{ x: number; y: number; z: number }>, index: number) => {
      const category = result.handednesses?.[index]?.[0];
      const handedness = category?.categoryName === 'Left' || category?.categoryName === 'Right' ? category.categoryName : 'Unknown';
      const id = `${handedness}-${index}`;
      const points = this.smoother.smooth(
        id,
        landmarks.map((point: { x: number; y: number; z: number }) => ({ x: point.x, y: point.y, z: point.z })),
        now,
      );
      return {
        id,
        handedness,
        confidence: category?.score ?? 0.75,
        landmarks: points,
        worldLandmarks: result.worldLandmarks?.[index]?.map((point: { x: number; y: number; z: number }) => ({ x: point.x, y: point.y, z: point.z })),
      };
    });

    return { hands, normalizedHands: normalizeHands(hands) };
  }

  close() {
    this.detector?.close();
    this.detector = null;
    this.smoother.clear();
    this.rate.reset();
  }
}
