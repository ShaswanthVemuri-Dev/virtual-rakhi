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

/** Fuses right-forearm pose with right-hand world landmarks for wrist roll and size. */
export class WristTracker {
  private pose: PoseLandmarker | null = null;
  private hand: HandLandmarker | null = null;
  private lastInference = -Infinity;
  private readonly intervalMs = 1000 / 18;
  private readonly smoother = new LandmarkSmoother();
  private readonly xFilter = new OneEuroFilter(1.5, 0.05);
  private readonly yFilter = new OneEuroFilter(1.5, 0.05);
  private readonly scaleFilter = new OneEuroFilter(1.0, 0.035);
  private readonly angleFilter = new OneEuroFilter(1.1, 0.035);
  private readonly widthFilter = new OneEuroFilter(1.0, 0.04);
  private readonly facingFilter = new OneEuroFilter(1.0, 0.035);
  private readonly wristPose = new RightWristPoseStabilizer();
  readonly rate = new RateMeter();

  async init() {
    if (!this.pose || !this.hand) [this.pose, this.hand] = await Promise.all([createPoseLandmarker(), createHandLandmarker(2)]);
  }

  async process(video: HTMLVideoElement, now: number): Promise<{ anchor: WristAnchor | null; landmarks: Vec3[] } | null> {
    if (!this.pose || !this.hand || now - this.lastInference < this.intervalMs || video.readyState < 2) return null;
    this.lastInference = now;
    const poseResult = this.pose.detectForVideo(video, now);
    const handResult = this.hand.detectForVideo(video, now);
    this.rate.tick(now);
    const raw = poseResult.landmarks?.[0];
    if (!raw?.length) return { anchor: null, landmarks: [] };
    const landmarks = this.smoother.smooth('pose', raw.map((p) => ({ x: p.x, y: p.y, z: p.z })), now);
    const wrist = landmarks[RIGHT_WRIST];
    const elbow = landmarks[RIGHT_ELBOW];
    const rawWrist = raw[RIGHT_WRIST] as (typeof raw)[number] & { presence?: number };
    const rawElbow = raw[RIGHT_ELBOW] as (typeof raw)[number] & { presence?: number };
    if (!wrist || !elbow || !rawWrist || !rawElbow) return { anchor: null, landmarks };

    // Pose landmarks provide the anatomical right wrist. Associate the closest
    // detected hand with that point instead of trusting selfie handedness alone
    // (which can flip when browsers mirror the preview).
    const detectedHands = handResult.landmarks ?? [];
    let handIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    detectedHands.forEach((candidate, index) => {
      if (!candidate?.[0]) return;
      const separation = distance(candidate[0], wrist);
      if (separation < closestDistance) { closestDistance = separation; handIndex = index; }
    });
    const forearmLength = distance(wrist, elbow);
    if (handIndex < 0 || closestDistance > Math.max(.13, forearmLength * .9)) return { anchor: null, landmarks };
    const imageHand = handResult.landmarks?.[handIndex];
    const worldHand = handResult.worldLandmarks?.[handIndex];
    const handScore = handResult.handednesses?.[handIndex]?.[0]?.score ?? 0;
    const direction = normalize({ x: wrist.x - elbow.x, y: wrist.y - elbow.y });
    const angle = Math.atan2(direction.y, direction.x) + Math.PI / 2;
    const poseConfidence = Math.min(rawWrist.visibility ?? 0.75, rawElbow.visibility ?? 0.75);
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
    const associationConfidence = clamp(1 - closestDistance / Math.max(.13, forearmLength * .9), 0, 1);
    const confidence = clamp(poseConfidence * .45 + handScore * .24 + associationConfidence * .2 + clamp(forearmLength / .16, 0, 1) * .11, 0, 1);
    return { landmarks, anchor: {
      x: this.xFilter.filter(imageHand?.[0]?.x ?? wrist.x, now),
      y: this.yFilter.filter(imageHand?.[0]?.y ?? wrist.y, now),
      scale: this.scaleFilter.filter(clamp(Math.max(forearmLength * 0.86, wristWidth * 2.1), 0.08, 0.3), now),
      angle: this.angleFilter.filter(angle, now), confidence, forearmDirection: direction,
      wristWidth: this.widthFilter.filter(wristWidth, now), palmNormal, handDirection,
      dorsalFacing: this.facingFilter.filter(dorsalFacing, now),
    } };
  }

  close() {
    this.pose?.close(); this.hand?.close(); this.pose = null; this.hand = null;
    this.smoother.clear(); this.wristPose.reset(); this.rate.reset();
  }
}
