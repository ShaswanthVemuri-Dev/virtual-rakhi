import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { FaceAnchor } from '../types/vision';
import { clamp, distance } from './math';
import { OneEuroFilter } from './smoothing';
import { createFaceLandmarker } from './modelFactory';

export class FaceTracker {
  private detector: FaceLandmarker | null = null;
  private initPromise: Promise<void> | null = null;
  private generation = 0;
  private lastInference = -Infinity;
  private readonly intervalMs = 1000 / 15;
  private readonly xFilter = new OneEuroFilter(1.4, 0.04);
  private readonly yFilter = new OneEuroFilter(1.4, 0.04);
  private readonly scaleFilter = new OneEuroFilter(1.0, 0.03);
  private readonly rotationFilter = new OneEuroFilter(1.0, 0.025);

  async init() {
    if (this.detector) return;
    if (!this.initPromise) {
      const generation = this.generation;
      this.initPromise = createFaceLandmarker().then((detector) => {
        if (generation === this.generation) this.detector = detector;
        else detector.close();
      }).finally(() => { this.initPromise = null; });
    }
    await this.initPromise;
  }

  process(video: HTMLVideoElement, now: number): { anchor: FaceAnchor | null } | null {
    if (!this.detector || now - this.lastInference < this.intervalMs || video.readyState < 2) return null;
    this.lastInference = now;
    const result = this.detector.detectForVideo(video, now);
    const raw = result.faceLandmarks?.[0];
    if (!raw?.length) return { anchor: null };
    const leftEye = raw[33];
    const rightEye = raw[263];
    const glabella = raw[168] ?? raw[6];
    const foreheadTop = raw[10];
    if (!leftEye || !rightEye || !glabella || !foreheadTop) return { anchor: null };

    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const eyeDistance = distance(leftEye, rightEye, aspect);
    const rawX = glabella.x * 0.72 + foreheadTop.x * 0.28;
    const rawY = glabella.y * 0.64 + foreheadTop.y * 0.36;
    const rawRotation = Math.atan2(rightEye.y - leftEye.y, (rightEye.x - leftEye.x) * aspect);
    const geometryConfidence = clamp((eyeDistance - 0.045) / 0.12, 0, 1);
    const centeredConfidence = clamp(1 - Math.abs(rawX - 0.5) * 0.9, 0.65, 1);
    const confidence = clamp(0.72 + geometryConfidence * 0.22, 0, 0.98) * centeredConfidence;

    return {
      anchor: {
        x: this.xFilter.filter(rawX, now),
        y: this.yFilter.filter(rawY, now),
        scale: this.scaleFilter.filter(clamp(eyeDistance * 0.23, 0.018, 0.075), now),
        rotation: this.rotationFilter.filter(rawRotation, now),
        confidence,
      },
    };
  }

  close() {
    this.generation += 1;
    this.detector?.close();
    this.detector = null;
  }
}
