import type { NormalizedHand, TrackedHand, Vec2, Vec3 } from '../types/vision';
import { distance, normalize } from '../vision/math';

const MIDDLE_MCP = 9;
const DEFAULT_SOURCE_GUIDE = { x: 0.5, y: 0.55 };

const toLocal = (point: Vec3, wrist: Vec3, ex: Vec2, ey: Vec2, scale: number): Vec3 => {
  const dx = point.x - wrist.x;
  const dy = point.y - wrist.y;
  return {
    x: (dx * ex.x + dy * ex.y) / scale,
    y: (dx * ey.x + dy * ey.y) / scale,
    z: (point.z - wrist.z) / scale,
  };
};

export const normalizeHands = (hands: TrackedHand[]): NormalizedHand[] => {
  if (!hands.length) return [];
  const palmScales = hands.map((hand) => Math.max(distance(hand.landmarks[0], hand.landmarks[MIDDLE_MCP]), 0.015));
  const averageScale = palmScales.reduce((sum, value) => sum + value, 0) / palmScales.length;
  const pairCenter = hands.reduce(
    (sum, hand) => ({ x: sum.x + hand.landmarks[0].x / hands.length, y: sum.y + hand.landmarks[0].y / hands.length }),
    { x: 0, y: 0 },
  );

  return hands.map((hand, index) => {
    const wrist = hand.landmarks[0];
    const middle = hand.landmarks[MIDDLE_MCP];
    const ex = normalize({ x: middle.x - wrist.x, y: middle.y - wrist.y });
    const ey = { x: -ex.y, y: ex.x };
    const palmScale = palmScales[index];
    return {
      id: hand.id,
      handedness: hand.handedness,
      confidence: hand.confidence,
      localLandmarks: hand.landmarks.map((point) => toLocal(point, wrist, ex, ey, palmScale)),
      palmScale,
      palmAngle: Math.atan2(ex.y, ex.x),
      wrist: { x: wrist.x, y: wrist.y },
      workspaceOffset: {
        x: (wrist.x - pairCenter.x) / averageScale,
        y: (wrist.y - pairCenter.y) / averageScale,
      },
      pairCenter,
      pairScale: averageScale,
    };
  });
};

export interface RetargetTarget {
  x: number;
  y: number;
  palmScale: number;
  angle: number;
  sourceGuide?: Vec2;
  motionGain?: number;
}

export const retargetHand = (hand: NormalizedHand, target: RetargetTarget): Vec3[] => {
  const cos = Math.cos(target.angle);
  const sin = Math.sin(target.angle);
  const offsetGain = target.palmScale * 0.72;
  const sourceGuide = target.sourceGuide ?? DEFAULT_SOURCE_GUIDE;
  const motionGain = target.motionGain ?? 0.9;
  const pairMotion = {
    x: (hand.pairCenter.x - sourceGuide.x) * motionGain,
    y: (hand.pairCenter.y - sourceGuide.y) * motionGain,
  };
  const origin = {
    x: target.x + pairMotion.x + hand.workspaceOffset.x * offsetGain,
    y: target.y + pairMotion.y + hand.workspaceOffset.y * offsetGain,
  };

  return hand.localLandmarks.map((point) => ({
    x: origin.x + (point.x * cos - point.y * sin) * target.palmScale,
    y: origin.y + (point.x * sin + point.y * cos) * target.palmScale,
    z: point.z * target.palmScale,
  }));
};

export const pairGuideDistance = (hands: NormalizedHand[], guide: Vec2 = DEFAULT_SOURCE_GUIDE) => {
  if (!hands.length) return Number.POSITIVE_INFINITY;
  const center = hands[0].pairCenter;
  return Math.hypot(center.x - guide.x, center.y - guide.y);
};
