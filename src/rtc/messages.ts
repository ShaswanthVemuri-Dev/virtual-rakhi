import type { FaceAnchor, NormalizedHand, WristAnchor } from '../types/vision';
import type { CeremonyRole } from '../app/ceremonyState';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';

export const PROTOCOL_VERSION = 7;

export type CeremonyMessage =
  | { type: 'JOIN_READY' }
  | { type: 'SESSION_INIT'; role: CeremonyRole; startInMs: number; duration: number; version: number }
  | { type: 'TRACKING_READY' }
  | { type: 'AARTI_START'; timestamp: number }
  | { type: 'AARTI_COMPLETE'; timestamp: number }
  | { type: 'TILAK_START'; timestamp: number }
  | { type: 'TILAK_ANIMATE'; timestamp: number }
  | { type: 'TILAK_APPLIED'; timestamp: number }
  | { type: 'FACE_ANCHOR'; payload: FaceAnchor | null }
  | { type: 'RAKHI_START'; timestamp: number }
  | { type: 'WRIST_ANCHOR'; payload: WristAnchor | null }
  | { type: 'GIVER_HANDS'; payload: NormalizedHand[] }
  | { type: 'RAKHI_STATE'; state: RakhiTyingState; instruction: string; progress: number }
  | { type: 'RAKHI_ATTACHED'; timestamp: number }
  | { type: 'BLESSING'; timestamp: number; target: CeremonyRole }
  | { type: 'TIMER_SYNC'; remaining: number; timestamp: number }
  | { type: 'MEDIA_STATE'; audio: boolean; video: boolean }
  | { type: 'CALL_END'; timestamp: number; reason: 'MANUAL' | 'TIMER' | 'DISCONNECT' };

export const isCeremonyMessage = (value: unknown): value is CeremonyMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  const finite = (input: unknown): input is number => typeof input === 'number' && Number.isFinite(input);
  const point = (input: unknown, min = 0, max = 1) => {
    if (!input || typeof input !== 'object') return false;
    const value = input as Record<string, unknown>;
    return finite(value.x) && finite(value.y) && value.x >= min && value.x <= max && value.y >= min && value.y <= max;
  };
  const anchor = (input: unknown, face: boolean) => {
    if (input === null) return true;
    if (!input || typeof input !== 'object') return false;
    const value = input as Record<string, unknown>;
    return point(value) && finite(value.scale) && value.scale > 0 && value.scale < 1
      && finite(value[face ? 'rotation' : 'angle']) && finite(value.confidence) && value.confidence >= 0 && value.confidence <= 1
      && (face || (point(value.forearmDirection, -1.1, 1.1)
        && (value.wristWidth === undefined || (finite(value.wristWidth) && value.wristWidth > 0.005 && value.wristWidth < 0.3))
        && (value.dorsalFacing === undefined || (finite(value.dorsalFacing) && value.dorsalFacing >= 0 && value.dorsalFacing <= 1))));
  };
  const rakhiStates = new Set(['IDLE', 'WAIT_FOR_RECEIVER_WRIST', 'WAIT_FOR_GIVER_HANDS', 'POSITIONING', 'APPROACHING_WRIST', 'ALIGNMENT_VALID', 'FINISHING_ANIMATION', 'RAKHI_ATTACHED']);
  const timed = () => finite(message.timestamp);
  switch (message.type) {
    case 'JOIN_READY': return true;
    case 'TRACKING_READY': return true;
    case 'SESSION_INIT': return (message.role === 'GIVER' || message.role === 'RECEIVER') && finite(message.startInMs) && message.startInMs >= 0 && message.startInMs <= 5_000 && finite(message.duration) && message.duration >= 30 && message.duration <= 1200 && finite(message.version);
    case 'FACE_ANCHOR': return anchor(message.payload, true);
    case 'WRIST_ANCHOR': return anchor(message.payload, false);
    case 'GIVER_HANDS': return Array.isArray(message.payload) && message.payload.length <= 2 && message.payload.every((hand) => {
      if (!hand || typeof hand !== 'object') return false;
      const candidate = hand as Record<string, unknown>;
      return typeof candidate.id === 'string' && candidate.id.length <= 32
        && (candidate.handedness === 'Left' || candidate.handedness === 'Right' || candidate.handedness === 'Unknown')
        && finite(candidate.confidence) && candidate.confidence >= 0 && candidate.confidence <= 1
        && finite(candidate.palmScale) && candidate.palmScale >= .005 && candidate.palmScale <= 1
        && finite(candidate.palmAngle) && Math.abs(candidate.palmAngle) <= Math.PI * 4
        && point(candidate.wrist) && point(candidate.workspaceOffset, -10, 10) && point(candidate.pairCenter)
        && finite(candidate.pairScale) && candidate.pairScale >= .005 && candidate.pairScale <= 1
        && finite(candidate.aspect) && candidate.aspect >= .5 && candidate.aspect <= 3
        && Array.isArray(candidate.localLandmarks) && candidate.localLandmarks.length === 21
        && candidate.localLandmarks.every((landmark) => point(landmark, -10, 10) && finite((landmark as Record<string, unknown>).z) && Math.abs((landmark as Record<string, number>).z) <= 10);
    });
    case 'RAKHI_STATE': return typeof message.state === 'string' && rakhiStates.has(message.state) && typeof message.instruction === 'string' && message.instruction.length <= 180 && finite(message.progress) && message.progress >= 0 && message.progress <= 1;
    case 'TIMER_SYNC': return finite(message.remaining) && message.remaining >= 0 && message.remaining <= 1200 && timed();
    case 'MEDIA_STATE': return typeof message.audio === 'boolean' && typeof message.video === 'boolean';
    case 'CALL_END': return timed() && (message.reason === 'MANUAL' || message.reason === 'TIMER' || message.reason === 'DISCONNECT');
    case 'BLESSING': return timed() && (message.target === 'GIVER' || message.target === 'RECEIVER');
    case 'AARTI_START': case 'AARTI_COMPLETE': case 'TILAK_START': case 'TILAK_ANIMATE': case 'TILAK_APPLIED':
    case 'RAKHI_START': case 'RAKHI_ATTACHED': return timed();
    default: return false;
  }
};

const round = (value: number) => Math.round(value * 10_000) / 10_000;

export const compactHands = (hands: NormalizedHand[]): NormalizedHand[] => hands.map((hand) => ({
  ...hand,
  confidence: round(hand.confidence),
  palmScale: round(hand.palmScale),
  palmAngle: round(hand.palmAngle),
  wrist: { x: round(hand.wrist.x), y: round(hand.wrist.y) },
  workspaceOffset: { x: round(hand.workspaceOffset.x), y: round(hand.workspaceOffset.y) },
  pairCenter: { x: round(hand.pairCenter.x), y: round(hand.pairCenter.y) },
  pairScale: round(hand.pairScale),
  aspect: round(hand.aspect),
  localLandmarks: hand.localLandmarks.map((point) => ({ x: round(point.x), y: round(point.y), z: round(point.z) })),
}));

export const canReceiveMessage = (
  message: CeremonyMessage,
  localRole: CeremonyRole,
  isHost: boolean,
  active: boolean,
) => {
  if (message.type === 'JOIN_READY') return isHost && !active;
  if (message.type === 'SESSION_INIT') return !isHost && !active;
  if (!active) return false;
  const senderRole: CeremonyRole = localRole === 'GIVER' ? 'RECEIVER' : 'GIVER';
  if (['AARTI_START', 'AARTI_COMPLETE', 'TILAK_START', 'RAKHI_START', 'GIVER_HANDS', 'RAKHI_STATE', 'RAKHI_ATTACHED'].includes(message.type)) return senderRole === 'GIVER';
  if (['TRACKING_READY', 'TILAK_ANIMATE', 'TILAK_APPLIED', 'FACE_ANCHOR', 'WRIST_ANCHOR'].includes(message.type)) return senderRole === 'RECEIVER';
  if (message.type === 'TIMER_SYNC') return !isHost;
  if (message.type === 'BLESSING') return message.target === localRole;
  return true;
};
