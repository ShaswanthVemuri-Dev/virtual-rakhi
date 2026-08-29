import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { TrackedHand } from '../types/vision';
import { LandmarkSmoother } from './smoothing';
import { createHandLandmarker } from './modelFactory';

export class HandTracker {
  private detector: HandLandmarker | null = null;
  private initPromise: Promise<void> | null = null;
  private generation = 0;
  private lastInference = -Infinity;
  private readonly intervalMs = 1000 / 27;
  private readonly smoother = new LandmarkSmoother();

  async init() {
    if (this.detector) return;
    if (!this.initPromise) {
      const generation = this.generation;
      this.initPromise = createHandLandmarker().then((detector) => {
        if (generation === this.generation) this.detector = detector;
        else detector.close();
      }).finally(() => { this.initPromise = null; });
    }
    await this.initPromise;
  }

  process(video: HTMLVideoElement, now: number): { hands: TrackedHand[] } | null {
    if (!this.detector || now - this.lastInference < this.intervalMs || video.readyState < 2) return null;
    this.lastInference = now;
    const result = this.detector.detectForVideo(video, now);

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

    return { hands };
  }

  close() {
    this.generation += 1;
    this.detector?.close();
    this.detector = null;
    this.smoother.clear();
  }
}
