import type { NormalizedHand, WristAnchor } from '../types/vision';
import { handsHoldingRakhi, rakhiPlacement } from './handRetargeting';

export type RakhiTyingState =
  | 'IDLE'
  | 'WAIT_FOR_RECEIVER_WRIST'
  | 'WAIT_FOR_GIVER_HANDS'
  | 'POSITIONING'
  | 'APPROACHING_WRIST'
  | 'ALIGNMENT_VALID'
  | 'WAIT_FOR_HAND_CONTACT'
  | 'TYING_GESTURE'
  | 'FINISHING_ANIMATION'
  | 'RAKHI_ATTACHED';

export interface TyingUpdate {
  state: RakhiTyingState;
  instruction: string;
  progress: number;
  captureWrist?: WristAnchor;
  attachedNow?: boolean;
}

const copy: Record<RakhiTyingState, string> = {
  IDLE: 'Ready to begin Rakhi tying.',
  WAIT_FOR_RECEIVER_WRIST: 'Waiting for your brother to hold his right wrist toward the camera.',
  WAIT_FOR_GIVER_HANDS: 'His wrist is ready. Bring both hands into view.',
  POSITIONING: 'Touch the thumb and index finger on both hands. The Rakhi will appear between them.',
  APPROACHING_WRIST: 'Keep both pinches together and guide the Rakhi toward his wrist. Move your hands apart or together to resize it.',
  ALIGNMENT_VALID: 'Perfect — attaching the Rakhi now.',
  WAIT_FOR_HAND_CONTACT: 'Move the Rakhi toward his wrist.',
  TYING_GESTURE: 'Attaching the Rakhi.',
  FINISHING_ANIMATION: 'The Rakhi is tying itself around his wrist. You can gently remove your hands.',
  RAKHI_ATTACHED: 'Rakhi attached.',
};

export class RakhiTyingMachine {
  private state: RakhiTyingState = 'IDLE';
  private stableSince = -1;

  reset() { this.state = 'IDLE'; this.stableSince = -1; }
  start() { this.state = 'WAIT_FOR_RECEIVER_WRIST'; this.stableSince = -1; return this.snapshot(); }
  getState() { return this.state; }

  private setState(next: RakhiTyingState, now: number) {
    if (next !== this.state) { this.state = next; this.stableSince = now; }
  }

  private snapshot(extra: Partial<TyingUpdate> = {}): TyingUpdate {
    const progress: Record<RakhiTyingState, number> = {
      IDLE: 0, WAIT_FOR_RECEIVER_WRIST: .08, WAIT_FOR_GIVER_HANDS: .28, POSITIONING: .4,
      APPROACHING_WRIST: .68, ALIGNMENT_VALID: .9, WAIT_FOR_HAND_CONTACT: .68,
      TYING_GESTURE: .9, FINISHING_ANIMATION: .97, RAKHI_ATTACHED: 1,
    };
    return { state: this.state, instruction: copy[this.state], progress: progress[this.state], ...extra };
  }

  update(now: number, wrist: WristAnchor | null, hands: NormalizedHand[], requireContinuousWrist = false): TyingUpdate {
    if (this.state === 'IDLE' || this.state === 'RAKHI_ATTACHED') return this.snapshot();

    if (this.state === 'WAIT_FOR_RECEIVER_WRIST') {
      if (!wrist || wrist.confidence < .62) { this.stableSince = -1; return this.snapshot(); }
      if (this.stableSince < 0) this.stableSince = now;
      // Two normal 65 ms wrist packets reject a one-frame false positive
      // without making the sister wait for the independent 3D pose solver.
      if (now - this.stableSince >= 130) {
        this.setState('WAIT_FOR_GIVER_HANDS', now);
        return this.snapshot({ captureWrist: wrist });
      }
      return this.snapshot();
    }

    if (this.state === 'FINISHING_ANIMATION') {
      if (now - this.stableSince >= 220) {
        this.setState('RAKHI_ATTACHED', now);
        return this.snapshot({ attachedNow: true });
      }
      return this.snapshot();
    }

    if (requireContinuousWrist && (!wrist || wrist.confidence < .48)) {
      this.setState('WAIT_FOR_RECEIVER_WRIST', now);
      return this.snapshot();
    }

    const readyHands = hands.length === 2 && hands.every((hand) => hand.confidence >= .6);
    if (!readyHands) { this.setState('WAIT_FOR_GIVER_HANDS', now); return this.snapshot(); }
    const holding = handsHoldingRakhi(hands);
    if (!holding) { this.setState('POSITIONING', now); return this.snapshot(); }

    const placement = wrist && rakhiPlacement(hands, wrist);
    const attachmentRadius = Math.max(.065, (wrist?.wristWidth ?? (wrist?.scale ?? .1) * .42) * 1.15);
    if (!placement || placement.wristDistance > attachmentRadius) { this.setState('APPROACHING_WRIST', now); return this.snapshot(); }

    if (this.state !== 'ALIGNMENT_VALID') { this.setState('ALIGNMENT_VALID', now); return this.snapshot(); }
    if (now - this.stableSince >= 140) this.setState('FINISHING_ANIMATION', now);
    return this.snapshot();
  }
}
