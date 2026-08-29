import type { NormalizedHand, TrackedHand, Vec2, Vec3, WristAnchor } from '../types/vision';
import { distance, normalize } from '../vision/math';

const MIDDLE_MCP = 9;

const toLocal = (point: Vec3, wrist: Vec3, ex: Vec2, ey: Vec2, scale: number, aspect: number): Vec3 => {
  const dx = (point.x - wrist.x) * aspect;
  const dy = point.y - wrist.y;
  return {
    x: (dx * ex.x + dy * ex.y) / scale,
    y: (dx * ey.x + dy * ey.y) / scale,
    z: (point.z - wrist.z) / scale,
  };
};

export const normalizeHands = (hands: TrackedHand[], aspect = 1): NormalizedHand[] => {
  if (!hands.length) return [];
  const ordered = [...hands].sort((a, b) => a.handedness.localeCompare(b.handedness) || a.landmarks[0].x - b.landmarks[0].x);
  const palmScales = ordered.map((hand) => Math.max(distance(hand.landmarks[0], hand.landmarks[MIDDLE_MCP], aspect), 0.015));
  const averageScale = palmScales.reduce((sum, value) => sum + value, 0) / palmScales.length;
  const pairCenter = ordered.reduce(
    (sum, hand) => ({ x: sum.x + hand.landmarks[0].x / ordered.length, y: sum.y + hand.landmarks[0].y / ordered.length }),
    { x: 0, y: 0 },
  );

  return ordered.map((hand, index) => {
    const wrist = hand.landmarks[0];
    const middle = hand.landmarks[MIDDLE_MCP];
    const ex = normalize({ x: (middle.x - wrist.x) * aspect, y: middle.y - wrist.y });
    const ey = { x: -ex.y, y: ex.x };
    const palmScale = palmScales[index];
    return {
      id: hand.id,
      handedness: hand.handedness,
      confidence: hand.confidence,
      localLandmarks: hand.landmarks.map((point) => toLocal(point, wrist, ex, ey, palmScale, aspect)),
      palmScale,
      palmAngle: Math.atan2(ex.y, ex.x),
      wrist: { x: wrist.x, y: wrist.y },
      workspaceOffset: {
        x: (wrist.x - pairCenter.x) * aspect / averageScale,
        y: (wrist.y - pairCenter.y) / averageScale,
      },
      pairCenter,
      pairScale: averageScale,
      aspect,
    };
  });
};

/**
 * Canonical ceremony space: the receiver's unmirrored outgoing canvas.
 * The giver contributes her mirrored self-preview coordinates; the receiver
 * mirrors the complete overlay once only for his local selfie preview.
 */
export const mirrorHandsForCanvas = (hands: TrackedHand[], aspect = 1) => normalizeHands(hands.map((hand) => ({
  ...hand,
  landmarks: hand.landmarks.map((point) => ({ ...point, x: 1 - point.x })),
})), aspect);

/** Restores the sender's normalized hands to their exact camera-canvas positions. */
export const restoreHandsToCanvas = (hands: NormalizedHand[]) => hands.map((hand) => {
  const cos = Math.cos(hand.palmAngle);
  const sin = Math.sin(hand.palmAngle);
  const aspect = hand.aspect || 1;
  return hand.localLandmarks.map((point) => ({
    x: hand.wrist.x + (point.x * cos - point.y * sin) * hand.palmScale / aspect,
    y: hand.wrist.y + (point.x * sin + point.y * cos) * hand.palmScale,
    z: point.z * hand.palmScale,
  }));
});

export const handsHoldingRakhi = (hands: NormalizedHand[], threshold = .42) => hands.length === 2 && hands.every((hand) => {
  const thumb = hand.localLandmarks[4];
  const index = hand.localLandmarks[8];
  return hand.confidence >= .6 && !!thumb && !!index
    && Math.hypot(thumb.x - index.x, thumb.y - index.y, thumb.z - index.z) <= threshold;
});

/** The on-screen Rakhi position shared by rendering and attachment logic. */
export const rakhiPlacement = (hands: NormalizedHand[], wrist?: WristAnchor | null) => {
  if (hands.length !== 2) return null;
  const pinches = restoreHandsToCanvas(hands).map((points) => ({
    x: ((points[4]?.x ?? points[0].x) + (points[8]?.x ?? points[0].x)) / 2,
    y: ((points[4]?.y ?? points[0].y) + (points[8]?.y ?? points[0].y)) / 2,
  }));
  const center = { x: (pinches[0].x + pinches[1].x) / 2, y: (pinches[0].y + pinches[1].y) / 2 };
  const aspect = hands[0].aspect || 1;
  const span = Math.hypot((pinches[1].x - pinches[0].x) * aspect, pinches[1].y - pinches[0].y);
  if (![center.x, center.y, span].every(Number.isFinite)
    || center.x < 0 || center.x > 1 || center.y < 0 || center.y > 1
    || span < .025 || span > .75) return null;
  return {
    center,
    span,
    angle: Math.atan2(pinches[1].y - pinches[0].y, (pinches[1].x - pinches[0].x) * aspect),
    wristDistance: wrist ? Math.hypot((center.x - wrist.x) * aspect, center.y - wrist.y) : Number.POSITIVE_INFINITY,
    aspect,
  };
};
