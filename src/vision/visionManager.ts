import type { LabMode, Phase1Frame, VisionFeatures } from '../types/vision';
import { FaceTracker } from './faceTracker';
import { HandTracker } from './handTracker';
import { WristTracker } from './wristTracker';
import { RateMeter } from './smoothing';

const NONE: VisionFeatures = { face: false, wrist: false, hands: false };

const sameFeatures = (a: VisionFeatures, b: VisionFeatures) => a.face === b.face && a.wrist === b.wrist && a.hands === b.hands;

export class VisionManager {
  private face = new FaceTracker();
  private wrist = new WristTracker();
  private hands = new HandTracker();
  private features: VisionFeatures = { ...NONE };
  private latest: Phase1Frame = {
    timestamp: 0,
    faceAnchor: null,
    wristAnchor: null,
    faceLandmarks: [],
    poseLandmarks: [],
    hands: [],
    normalizedHands: [],
    stats: { faceFps: 0, wristFps: 0, handFps: 0, renderFps: 0 },
  };
  private renderRate = new RateMeter();

  async setMode(mode: LabMode) {
    return this.setFeatures(mode === 'RECEIVER' ? { face: true, wrist: true, hands: false } : { face: false, wrist: false, hands: true });
  }

  async setFeatures(next: VisionFeatures) {
    if (sameFeatures(this.features, next)) return;

    if (this.features.face && !next.face) {
      this.face.close();
      this.latest.faceAnchor = null;
      this.latest.faceLandmarks = [];
    }
    if (this.features.wrist && !next.wrist) {
      this.wrist.close();
      this.latest.wristAnchor = null;
      this.latest.poseLandmarks = [];
    }
    if (this.features.hands && !next.hands) {
      this.hands.close();
      this.latest.hands = [];
      this.latest.normalizedHands = [];
    }

    // Activate independently: a ready face or hand must not wait for another
    // model's download/initialization before it can begin processing frames.
    const previous = this.features;
    this.features = { ...next };
    const boots: Promise<void>[] = [];
    if (!previous.face && next.face) boots.push(this.face.init());
    if (!previous.wrist && next.wrist) boots.push(this.wrist.init());
    if (!previous.hands && next.hands) boots.push(this.hands.init());
    await Promise.all(boots);
  }

  getFeatures(): VisionFeatures {
    return { ...this.features };
  }

  preloadHands() {
    return this.hands.init();
  }

  async process(video: HTMLVideoElement, now: number): Promise<Phase1Frame> {
    this.renderRate.tick(now);
    const jobs: Promise<void>[] = [];

    if (this.features.face) {
      jobs.push(this.face.process(video, now).then((result) => {
        if (!result) return;
        this.latest.faceAnchor = result.anchor;
        this.latest.faceLandmarks = result.landmarks;
      }));
    }
    if (this.features.wrist) {
      jobs.push(this.wrist.process(video, now).then((result) => {
        if (!result) return;
        this.latest.wristAnchor = result.anchor;
        this.latest.poseLandmarks = result.landmarks;
      }));
    }
    if (this.features.hands) {
      jobs.push(this.hands.process(video, now).then((result) => {
        if (!result) return;
        this.latest.hands = result.hands;
        this.latest.normalizedHands = result.normalizedHands;
      }));
    }

    await Promise.all(jobs);
    this.latest.timestamp = now;
    this.latest.stats = {
      faceFps: this.face.rate.fps,
      wristFps: this.wrist.rate.fps,
      handFps: this.hands.rate.fps,
      renderFps: this.renderRate.fps,
    };
    return this.latest;
  }

  stop() {
    this.face.close();
    this.wrist.close();
    this.hands.close();
    this.features = { ...NONE };
    this.renderRate.reset();
    this.latest = {
      timestamp: 0,
      faceAnchor: null,
      wristAnchor: null,
      faceLandmarks: [],
      poseLandmarks: [],
      hands: [],
      normalizedHands: [],
      stats: { faceFps: 0, wristFps: 0, handFps: 0, renderFps: 0 },
    };
  }
}
