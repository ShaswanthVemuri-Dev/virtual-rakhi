import type { FaceAnchor, NormalizedHand, WristAnchor } from '../types/vision';
import type { CeremonyRole } from '../app/ceremonyState';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';

export const PROTOCOL_VERSION = 4;

export type CeremonyMessage =
  | { type: 'ROLE_SELECTED'; role: CeremonyRole }
  | { type: 'ROLE_CONFLICT'; requiredRole: CeremonyRole }
  | { type: 'SESSION_INIT'; role: CeremonyRole; startAt: number; duration: number; version: number }
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
  | { type: 'CALL_END'; timestamp: number; reason: 'MANUAL' | 'TIMER' | 'DISCONNECT' }
  | { type: 'PING'; timestamp: number }
  | { type: 'PONG'; timestamp: number };

export const isCeremonyMessage = (value: unknown): value is CeremonyMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  const finite = (input: unknown): input is number => typeof input === 'number' && Number.isFinite(input);
  const point = (input: unknown) => !!input && typeof input === 'object' && finite((input as Record<string, unknown>).x) && finite((input as Record<string, unknown>).y);
  const anchor = (input: unknown, face: boolean) => {
    if (input === null) return true;
    if (!input || typeof input !== 'object') return false;
    const value = input as Record<string, unknown>;
    const vec3 = (candidate: unknown) => point(candidate) && finite((candidate as Record<string, unknown>).z);
    return point(value) && finite(value.scale) && value.scale > 0 && value.scale < 1
      && finite(value[face ? 'rotation' : 'angle']) && finite(value.confidence) && value.confidence >= 0 && value.confidence <= 1
      && (face || (point(value.forearmDirection)
        && (value.wristWidth === undefined || (finite(value.wristWidth) && value.wristWidth > 0.005 && value.wristWidth < 0.3))
        && (value.dorsalFacing === undefined || (finite(value.dorsalFacing) && value.dorsalFacing >= 0 && value.dorsalFacing <= 1))
        && (value.palmNormal === undefined || vec3(value.palmNormal))
        && (value.handDirection === undefined || vec3(value.handDirection))));
  };
  const rakhiStates = new Set(['IDLE', 'WAIT_FOR_RECEIVER_WRIST', 'WAIT_FOR_GIVER_HANDS', 'POSITIONING', 'APPROACHING_WRIST', 'ALIGNMENT_VALID', 'WAIT_FOR_HAND_CONTACT', 'TYING_GESTURE', 'FINISHING_ANIMATION', 'RAKHI_ATTACHED']);
  const timed = () => finite(message.timestamp);
  switch (message.type) {
    case 'ROLE_SELECTED': return message.role === 'GIVER' || message.role === 'RECEIVER';
    case 'ROLE_CONFLICT': return message.requiredRole === 'GIVER' || message.requiredRole === 'RECEIVER';
    case 'SESSION_INIT': return (message.role === 'GIVER' || message.role === 'RECEIVER') && finite(message.startAt) && finite(message.duration) && message.duration >= 30 && message.duration <= 1200 && finite(message.version);
    case 'FACE_ANCHOR': return anchor(message.payload, true);
    case 'WRIST_ANCHOR': return anchor(message.payload, false);
    case 'GIVER_HANDS': return Array.isArray(message.payload) && message.payload.length <= 2 && message.payload.every((hand) => {
      if (!hand || typeof hand !== 'object') return false;
      const candidate = hand as Record<string, unknown>;
      return typeof candidate.id === 'string' && candidate.id.length <= 32
        && (candidate.handedness === 'Left' || candidate.handedness === 'Right' || candidate.handedness === 'Unknown')
        && finite(candidate.confidence) && finite(candidate.palmScale) && finite(candidate.palmAngle)
        && point(candidate.wrist) && point(candidate.workspaceOffset) && point(candidate.pairCenter)
        && finite(candidate.pairScale) && Array.isArray(candidate.localLandmarks)
        && candidate.localLandmarks.length === 21 && candidate.localLandmarks.every((landmark) => point(landmark) && finite((landmark as Record<string, unknown>).z));
    });
    case 'RAKHI_STATE': return typeof message.state === 'string' && rakhiStates.has(message.state) && typeof message.instruction === 'string' && message.instruction.length <= 180 && finite(message.progress) && message.progress >= 0 && message.progress <= 1;
    case 'TIMER_SYNC': return finite(message.remaining) && message.remaining >= 0 && message.remaining <= 1200 && timed();
    case 'MEDIA_STATE': return typeof message.audio === 'boolean' && typeof message.video === 'boolean';
    case 'CALL_END': return timed() && (message.reason === 'MANUAL' || message.reason === 'TIMER' || message.reason === 'DISCONNECT');
    case 'BLESSING': return timed() && (message.target === 'GIVER' || message.target === 'RECEIVER');
    case 'AARTI_START': case 'AARTI_COMPLETE': case 'TILAK_START': case 'TILAK_ANIMATE': case 'TILAK_APPLIED':
    case 'RAKHI_START': case 'RAKHI_ATTACHED': case 'PING': case 'PONG': return timed();
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
  localLandmarks: hand.localLandmarks.map((point) => ({ x: round(point.x), y: round(point.y), z: round(point.z) })),
}));
