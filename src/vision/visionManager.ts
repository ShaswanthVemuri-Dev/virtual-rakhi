import type { Phase1Frame, VisionFeatures } from '../types/vision';
import { FaceTracker } from './faceTracker';
import { HandTracker } from './handTracker';
import { WristTracker } from './wristTracker';

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
    hands: [],
    normalizedHands: [],
  };

  async setFeatures(next: VisionFeatures) {
    if (sameFeatures(this.features, next)) return;

    if (this.features.face && !next.face) {
      this.face.close();
      this.latest.faceAnchor = null;
    }
    if (this.features.wrist && !next.wrist) {
      this.wrist.close();
      this.latest.wristAnchor = null;
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

  preloadHands() {
    return this.hands.init();
  }

  process(video: HTMLVideoElement, now: number): Phase1Frame {
    if (this.features.face) {
      const result = this.face.process(video, now);
      if (result) this.latest.faceAnchor = result.anchor;
    }
    if (this.features.wrist) {
      const result = this.wrist.process(video, now);
      if (result) this.latest.wristAnchor = result.anchor;
    }
    if (this.features.hands) {
      const result = this.hands.process(video, now);
      if (result) this.latest.hands = result.hands;
    }
    this.latest.timestamp = now;
    return this.latest;
  }

  stop() {
    this.face.close();
    this.wrist.close();
    this.hands.close();
    this.features = { ...NONE };
    this.latest = {
      timestamp: 0,
      faceAnchor: null,
      wristAnchor: null,
      hands: [],
      normalizedHands: [],
    };
  }
}
