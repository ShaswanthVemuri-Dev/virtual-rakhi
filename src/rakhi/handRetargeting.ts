import type { NormalizedHand, TrackedHand, Vec2, Vec3, WristAnchor } from '../types/vision';
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

/**
 * Canonical ceremony space: the receiver's unmirrored outgoing canvas.
 * The giver contributes her mirrored self-preview coordinates; the receiver
 * mirrors the complete overlay once only for his local selfie preview.
 */
export const mirrorHandsForCanvas = (hands: TrackedHand[]) => normalizeHands(hands.map((hand) => ({
  ...hand,
  landmarks: hand.landmarks.map((point) => ({ ...point, x: 1 - point.x })),
})));

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

export const retargetHandsToWrist = (hands: NormalizedHand[], wrist: WristAnchor) => {
  const palmScale = Math.max(.045, wrist.scale * .42);
  return hands.map((hand) => retargetHand(hand, {
    x: wrist.x,
    y: wrist.y,
    palmScale,
    angle: wrist.angle - Math.PI / 2,
    motionGain: .92,
  }));
};

/** Restores the sender's normalized hands to their exact camera-canvas positions. */
export const restoreHandsToCanvas = (hands: NormalizedHand[]) => hands.map((hand) => {
  const cos = Math.cos(hand.palmAngle);
  const sin = Math.sin(hand.palmAngle);
  return hand.localLandmarks.map((point) => ({
    x: hand.wrist.x + (point.x * cos - point.y * sin) * hand.palmScale,
    y: hand.wrist.y + (point.x * sin + point.y * cos) * hand.palmScale,
    z: point.z * hand.palmScale,
  }));
});

export const handsHoldingRakhi = (hands: NormalizedHand[]) => hands.length === 2 && hands.every((hand) => {
  const thumb = hand.localLandmarks[4];
  const index = hand.localLandmarks[8];
  return hand.confidence >= .6 && !!thumb && !!index
    && Math.hypot(thumb.x - index.x, thumb.y - index.y, thumb.z - index.z) <= .42;
});

/** The on-screen Rakhi position shared by rendering and attachment logic. */
export const rakhiPlacement = (hands: NormalizedHand[], wrist?: WristAnchor | null) => {
  if (hands.length !== 2) return null;
  const pinches = restoreHandsToCanvas(hands).map((points) => ({
    x: ((points[4]?.x ?? points[0].x) + (points[8]?.x ?? points[0].x)) / 2,
    y: ((points[4]?.y ?? points[0].y) + (points[8]?.y ?? points[0].y)) / 2,
  }));
  const center = { x: (pinches[0].x + pinches[1].x) / 2, y: (pinches[0].y + pinches[1].y) / 2 };
  const span = Math.hypot(pinches[1].x - pinches[0].x, pinches[1].y - pinches[0].y);
  if (![center.x, center.y, span].every(Number.isFinite)
    || center.x < 0 || center.x > 1 || center.y < 0 || center.y > 1
    || span < .025 || span > .75) return null;
  return {
    center,
    span,
    angle: Math.atan2(pinches[1].y - pinches[0].y, pinches[1].x - pinches[0].x),
    wristDistance: wrist ? Math.hypot(center.x - wrist.x, center.y - wrist.y) : Number.POSITIVE_INFINITY,
  };
};
