import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Vec3, WristAnchor } from '../types/vision';
import { clamp, distance, normalize } from './math';
import { LandmarkSmoother, OneEuroFilter } from './smoothing';
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
export const chooseRightHandIndex = (hands: Vec3[][], poseWrist: Vec3 | null, previous: Vec3 | null, aspect = 1) => {
  if (!hands.length) return -1;
  const target = poseWrist ?? previous;
  if (!target) return -1;
  if (hands.length === 1) return 0;
  let selected = -1;
  let closest = Number.POSITIVE_INFINITY;
  hands.forEach((hand, index) => {
    if (!hand[0]) return;
    const separation = distance(hand[0], target, aspect);
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
  private poseWrist: Vec3 | null = null;
  private poseElbow: Vec3 | null = null;
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
      }).finally(() => { this.poseInitPromise = null; });
    }
    await Promise.all([this.handInitPromise, this.poseInitPromise]);
  }

  process(video: HTMLVideoElement, now: number): { anchor: WristAnchor | null } | null {
    if (!this.hand || now - this.lastInference < this.intervalMs || video.readyState < 2) return null;
    this.lastInference = now;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    if (this.pose && now - this.lastPoseInference >= this.poseIntervalMs) {
      this.lastPoseInference = now;
      const poseResult = this.pose.detectForVideo(video, now);
      const raw = poseResult.landmarks?.[0];
      const rawWrist = raw?.[RIGHT_WRIST];
      const rawElbow = raw?.[RIGHT_ELBOW];
      if (rawWrist && rawElbow) {
        [this.poseWrist, this.poseElbow] = this.smoother.smooth('pose-right', [rawWrist, rawElbow].map((point) => ({ x: point.x, y: point.y, z: point.z })), now);
      } else {
        this.poseWrist = null;
        this.poseElbow = null;
      }
      this.poseConfidence = rawWrist && rawElbow
        ? Math.min(rawWrist.visibility ?? .75, rawElbow.visibility ?? .75)
        : 0;
    }
    const handResult = this.hand.detectForVideo(video, now);
    const poseWrist = this.poseWrist;
    const elbow = this.poseElbow;

    // Crucially, a missing full-body pose no longer rejects a hand that the
    // close-range Hand Landmarker still sees.
    const detectedHands = handResult.landmarks ?? [];
    const handIndex = chooseRightHandIndex(detectedHands, poseWrist, this.lastRightPoint, aspect);
    const imageHand = handIndex >= 0 ? detectedHands[handIndex] : undefined;
    const worldHand = handIndex >= 0 ? handResult.worldLandmarks?.[handIndex] : undefined;
    const handScore = handIndex >= 0 ? handResult.handednesses?.[handIndex]?.[0]?.score ?? .75 : 0;
    const wrist = imageHand?.[0] ?? poseWrist;
    if (!wrist) return { anchor: null };

    const hasPose = !!poseWrist && !!elbow;
    const forearmLength = hasPose
      ? distance(poseWrist, elbow, aspect)
      : imageHand?.[MIDDLE_MCP] ? distance(wrist, imageHand[MIDDLE_MCP], aspect) * 1.7 : .12;
    const direction = hasPose
      ? normalize({ x: (poseWrist.x - elbow.x) * aspect, y: poseWrist.y - elbow.y })
      : imageHand?.[MIDDLE_MCP]
        ? normalize({ x: (imageHand[MIDDLE_MCP].x - wrist.x) * aspect, y: imageHand[MIDDLE_MCP].y - wrist.y })
        : this.lastDirection;
    this.lastDirection = direction;
    const angle = Math.atan2(direction.y, direction.x) + Math.PI / 2;
    let wristWidth = clamp(forearmLength * 0.4, 0.035, 0.11);
    let dorsalFacing = 0.7;
    if (imageHand?.[0] && imageHand?.[INDEX_MCP] && imageHand?.[MIDDLE_MCP] && imageHand?.[PINKY_MCP]) {
      const acrossPalm = distance(imageHand[INDEX_MCP], imageHand[PINKY_MCP], aspect) * .64;
      const palmLength = distance(imageHand[0], imageHand[MIDDLE_MCP], aspect) * .52;
      // Max of two independent measurements prevents the bracelet collapsing
      // when a side-facing fist foreshortens the index-to-pinky distance.
      wristWidth = clamp(Math.max(acrossPalm, palmLength, forearmLength * .31), .03, .14);
    }
    if (imageHand && worldHand) {
      const estimated = estimateRightWristPose(worldHand);
      if (estimated) {
        const stable = this.wristPose.update(estimated, imageHand, now);
        // MediaPipe world Z points away from the viewer; negative is closer.
        dorsalFacing = clamp(.5 - stable.dorsal.z * 2.35, 0, 1);
      }
    }
    const reference = poseWrist ?? this.lastRightPoint;
    const associationConfidence = imageHand
      ? reference ? clamp(1 - distance(imageHand[0], reference, aspect) / .22, 0, 1) : .9
      : 0;
    const sizeConfidence = clamp(forearmLength / .16, 0, 1);
    const confidence = imageHand
      ? clamp(handScore * .5 + associationConfidence * .3 + sizeConfidence * .2, 0, .98)
      : clamp(this.poseConfidence * .78 + sizeConfidence * .12, 0, .88);
    this.lastRightPoint = { x: wrist.x, y: wrist.y, z: wrist.z };
    return { anchor: {
      x: this.xFilter.filter(wrist.x, now),
      y: this.yFilter.filter(wrist.y, now),
      scale: this.scaleFilter.filter(clamp(Math.max(forearmLength * 0.86, wristWidth * 2.1), 0.08, 0.3), now),
      angle: this.angleFilter.filter(angle, now), confidence, forearmDirection: direction,
      wristWidth: this.widthFilter.filter(wristWidth, now),
      dorsalFacing: this.facingFilter.filter(dorsalFacing, now),
    } };
  }

  close() {
    this.generation += 1;
    this.pose?.close(); this.hand?.close(); this.pose = null; this.hand = null;
    this.smoother.clear(); this.wristPose.reset();
    [this.xFilter, this.yFilter, this.scaleFilter, this.angleFilter, this.widthFilter, this.facingFilter].forEach((filter) => filter.reset());
    this.lastRightPoint = null; this.lastDirection = { x: 0, y: -1 };
    this.poseWrist = null; this.poseElbow = null; this.poseConfidence = 0; this.lastInference = this.lastPoseInference = -Infinity;
  }
}
