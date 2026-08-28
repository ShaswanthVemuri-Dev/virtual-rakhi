import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Vec3, WristAnchor } from '../types/vision';
import { clamp, distance, normalize } from './math';
import { LandmarkSmoother, OneEuroFilter, RateMeter } from './smoothing';
import { createHandLandmarker, createPoseLandmarker } from './modelFactory';
import { estimateRightWristPose, RightWristPoseStabilizer } from './wristPose';

const RIGHT_ELBOW = 14;
const RIGHT_WRIST = 16;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;

/**
 * Pose identifies the anatomical right side when it is visible. The last
 * confirmed point preserves that association when a close wrist fills the
 * frame and Pose temporarily disappears.
 */
export const chooseRightHandIndex = (hands: Vec3[][], poseWrist: Vec3 | null, previous: Vec3 | null) => {
  if (!hands.length) return -1;
  if (hands.length === 1) return 0;
  const target = poseWrist ?? previous;
  if (!target) return -1;
  let selected = -1;
  let closest = Number.POSITIVE_INFINITY;
  hands.forEach((hand, index) => {
    if (!hand[0]) return;
    const separation = distance(hand[0], target);
    if (separation < closest) { closest = separation; selected = index; }
  });
  return selected;
};

/** Google wrist translation plus the VTO renderer's independent 3D pose. */
export class WristTracker {
  private pose: PoseLandmarker | null = null;
  private hand: HandLandmarker | null = null;
  private poseInitPromise: Promise<void> | null = null;
  private handInitPromise: Promise<void> | null = null;
  private generation = 0;
  private lastInference = -Infinity;
  private lastPoseInference = -Infinity;
  private readonly intervalMs = 1000 / 24;
  private readonly poseIntervalMs = 1000 / 6;
  private poseLandmarks: Vec3[] = [];
  private poseConfidence = 0;
  private readonly smoother = new LandmarkSmoother();
  private readonly xFilter = new OneEuroFilter(1.5, 0.05);
  private readonly yFilter = new OneEuroFilter(1.5, 0.05);
  private readonly scaleFilter = new OneEuroFilter(1.0, 0.035);
  private readonly angleFilter = new OneEuroFilter(1.1, 0.035);
  private readonly widthFilter = new OneEuroFilter(1.0, 0.04);
  private readonly facingFilter = new OneEuroFilter(1.0, 0.035);
  private readonly wristPose = new RightWristPoseStabilizer();
  private lastRightPoint: Vec3 | null = null;
  private lastDirection = { x: 0, y: -1 };
  readonly rate = new RateMeter();

  async init() {
    const generation = this.generation;
    if (!this.hand && !this.handInitPromise) {
      this.handInitPromise = createHandLandmarker(2).then((hand) => {
        if (generation === this.generation) this.hand = hand;
        else hand.close();
      }).finally(() => { this.handInitPromise = null; });
    }
    if (!this.pose && !this.poseInitPromise) {
      this.poseInitPromise = createPoseLandmarker().then((pose) => {
        if (generation === this.generation) this.pose = pose;
        else pose.close();
      }).catch((cause) => {
        // Pose only verifies anatomical side at distance. Hand landmarks remain
        // the required, responsive wrist-position source at close range.
        console.warn('Optional Pose Landmarker could not start.', cause);
      }).finally(() => { this.poseInitPromise = null; });
    }
    await this.handInitPromise;
  }

  async process(video: HTMLVideoElement, now: number): Promise<{ anchor: WristAnchor | null; landmarks: Vec3[] } | null> {
    if (!this.hand || now - this.lastInference < this.intervalMs || video.readyState < 2) return null;
    this.lastInference = now;
    if (this.pose && now - this.lastPoseInference >= this.poseIntervalMs) {
      this.lastPoseInference = now;
      const poseResult = this.pose.detectForVideo(video, now);
      const raw = poseResult.landmarks?.[0];
      this.poseLandmarks = raw?.length
        ? this.smoother.smooth('pose', raw.map((point) => ({ x: point.x, y: point.y, z: point.z })), now)
        : [];
      const rawWrist = raw?.[RIGHT_WRIST];
      const rawElbow = raw?.[RIGHT_ELBOW];
      this.poseConfidence = rawWrist && rawElbow
        ? Math.min(rawWrist.visibility ?? .75, rawElbow.visibility ?? .75)
        : 0;
    }
    const handResult = this.hand.detectForVideo(video, now);
    this.rate.tick(now);
    const landmarks = this.poseLandmarks;
    const poseWrist = landmarks[RIGHT_WRIST] ?? null;
    const elbow = landmarks[RIGHT_ELBOW] ?? null;

    // Crucially, a missing full-body pose no longer rejects a hand that the
    // close-range Hand Landmarker still sees.
    const detectedHands = handResult.landmarks ?? [];
    const handIndex = chooseRightHandIndex(detectedHands, poseWrist, this.lastRightPoint);
    const imageHand = handIndex >= 0 ? detectedHands[handIndex] : undefined;
    const worldHand = handIndex >= 0 ? handResult.worldLandmarks?.[handIndex] : undefined;
    const handScore = handIndex >= 0 ? handResult.handednesses?.[handIndex]?.[0]?.score ?? .75 : 0;
    const wrist = imageHand?.[0] ?? poseWrist;
    if (!wrist) return { anchor: null, landmarks };

    const hasPose = !!poseWrist && !!elbow;
    const forearmLength = hasPose
      ? distance(poseWrist, elbow)
      : imageHand?.[MIDDLE_MCP] ? distance(wrist, imageHand[MIDDLE_MCP]) * 1.7 : .12;
    const direction = hasPose
      ? normalize({ x: poseWrist.x - elbow.x, y: poseWrist.y - elbow.y })
      : imageHand?.[MIDDLE_MCP]
        ? normalize({ x: imageHand[MIDDLE_MCP].x - wrist.x, y: imageHand[MIDDLE_MCP].y - wrist.y })
        : this.lastDirection;
    this.lastDirection = direction;
    const angle = Math.atan2(direction.y, direction.x) + Math.PI / 2;
    let wristWidth = clamp(forearmLength * 0.4, 0.035, 0.11);
    let palmNormal: Vec3 = { x: 0, y: 0, z: 1 };
    let handDirection: Vec3 = { x: direction.x, y: direction.y, z: 0 };
    let dorsalFacing = 0.7;
    if (imageHand?.[0] && imageHand?.[INDEX_MCP] && imageHand?.[MIDDLE_MCP] && imageHand?.[PINKY_MCP]) {
      const acrossPalm = distance(imageHand[INDEX_MCP], imageHand[PINKY_MCP]) * .64;
      const palmLength = distance(imageHand[0], imageHand[MIDDLE_MCP]) * .52;
      // Max of two independent measurements prevents the bracelet collapsing
      // when a side-facing fist foreshortens the index-to-pinky distance.
      wristWidth = clamp(Math.max(acrossPalm, palmLength, forearmLength * .31), .03, .14);
    }
    if (imageHand && worldHand) {
      const estimated = estimateRightWristPose(worldHand);
      if (estimated) {
        const stable = this.wristPose.update(estimated, imageHand, now);
        palmNormal = stable.dorsal;
        handDirection = stable.axis;
        // MediaPipe world Z points away from the viewer; negative is closer.
        dorsalFacing = clamp(.5 - palmNormal.z * 2.35, 0, 1);
      }
    }
    const reference = poseWrist ?? this.lastRightPoint;
    const associationConfidence = imageHand
      ? reference ? clamp(1 - distance(imageHand[0], reference) / .22, 0, 1) : .9
      : 0;
    const sizeConfidence = clamp(forearmLength / .16, 0, 1);
    const confidence = imageHand
      ? clamp(handScore * .5 + associationConfidence * .3 + sizeConfidence * .2, 0, .98)
      : clamp(this.poseConfidence * .78 + sizeConfidence * .12, 0, .88);
    this.lastRightPoint = { x: wrist.x, y: wrist.y, z: wrist.z };
    return { landmarks, anchor: {
      x: this.xFilter.filter(wrist.x, now),
      y: this.yFilter.filter(wrist.y, now),
      scale: this.scaleFilter.filter(clamp(Math.max(forearmLength * 0.86, wristWidth * 2.1), 0.08, 0.3), now),
      angle: this.angleFilter.filter(angle, now), confidence, forearmDirection: direction,
      wristWidth: this.widthFilter.filter(wristWidth, now), palmNormal, handDirection,
      dorsalFacing: this.facingFilter.filter(dorsalFacing, now),
    } };
  }

  close() {
    this.generation += 1;
    this.pose?.close(); this.hand?.close(); this.pose = null; this.hand = null;
    this.smoother.clear(); this.wristPose.reset(); this.rate.reset();
    [this.xFilter, this.yFilter, this.scaleFilter, this.angleFilter, this.widthFilter, this.facingFilter].forEach((filter) => filter.reset());
    this.lastRightPoint = null; this.lastDirection = { x: 0, y: -1 };
    this.poseLandmarks = []; this.poseConfidence = 0; this.lastInference = this.lastPoseInference = -Infinity;
  }
}
