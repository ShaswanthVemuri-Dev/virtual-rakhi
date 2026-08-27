import type { NormalizedHand, WristAnchor } from '../types/vision';
import { pairGuideDistance } from './handRetargeting';

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

const instructions: Record<RakhiTyingState, string> = {
  IDLE: 'Ready to begin Rakhi tying.',
  WAIT_FOR_RECEIVER_WRIST: 'Brother, raise your right fist with the knuckle side facing the camera.',
  WAIT_FOR_GIVER_HANDS: 'Sister, bring both hands into view with the Rakhi held between your fingers.',
  POSITIONING: 'Keep both hands visible and comfortably apart.',
  APPROACHING_WRIST: 'Move both hands gently toward your brother’s wrist.',
  ALIGNMENT_VALID: 'That is the right place. Hold steady.',
  WAIT_FOR_HAND_CONTACT: 'Bring your fingers together as though wrapping the thread.',
  TYING_GESTURE: 'Hold for a moment to secure the Rakhi.',
  FINISHING_ANIMATION: 'Securing the Rakhi…',
  RAKHI_ATTACHED: 'The Rakhi is tied. Keep the right wrist visible to see it move naturally.',
};

export class RakhiTyingMachine {
  private state: RakhiTyingState = 'IDLE';
  private stableSince = -1;
  private hadHandsApart = false;
  private finishingSince = -1;

  reset() {
    this.state = 'IDLE';
    this.stableSince = -1;
    this.hadHandsApart = false;
    this.finishingSince = -1;
  }

  start() {
    this.state = 'WAIT_FOR_RECEIVER_WRIST';
    this.stableSince = -1;
    this.hadHandsApart = false;
    this.finishingSince = -1;
    return this.snapshot();
  }

  getState() {
    return this.state;
  }

  private setState(next: RakhiTyingState, now: number) {
    if (next === this.state) return;
    this.state = next;
    this.stableSince = now;
    if (next === 'FINISHING_ANIMATION') this.finishingSince = now;
  }

  private snapshot(extra: Partial<TyingUpdate> = {}): TyingUpdate {
    const progressMap: Record<RakhiTyingState, number> = {
      IDLE: 0,
      WAIT_FOR_RECEIVER_WRIST: 0.08,
      WAIT_FOR_GIVER_HANDS: 0.2,
      POSITIONING: 0.34,
      APPROACHING_WRIST: 0.5,
      ALIGNMENT_VALID: 0.66,
      WAIT_FOR_HAND_CONTACT: 0.75,
      TYING_GESTURE: 0.88,
      FINISHING_ANIMATION: 0.95,
      RAKHI_ATTACHED: 1,
    };
    return {
      state: this.state,
      instruction: instructions[this.state],
      progress: progressMap[this.state],
      ...extra,
    };
  }

  update(now: number, wrist: WristAnchor | null, hands: NormalizedHand[], requireContinuousWrist = false): TyingUpdate {
    if (this.state === 'IDLE' || this.state === 'RAKHI_ATTACHED') return this.snapshot();

    if (this.state === 'WAIT_FOR_RECEIVER_WRIST') {
      const ready = !!wrist && wrist.confidence >= 0.72;
      if (!ready) {
        this.stableSince = -1;
        return this.snapshot();
      }
      if (this.stableSince < 0) this.stableSince = now;
      if (now - this.stableSince >= 500) {
        this.setState('WAIT_FOR_GIVER_HANDS', now);
        return this.snapshot({ captureWrist: wrist ?? undefined });
      }
      return this.snapshot();
    }

    if (this.state === 'FINISHING_ANIMATION') {
      if (now - this.finishingSince >= 800) {
        this.setState('RAKHI_ATTACHED', now);
        return this.snapshot({ attachedNow: true });
      }
      return this.snapshot();
    }

    if (requireContinuousWrist && (!wrist || wrist.confidence < 0.6)) {
      this.setState('WAIT_FOR_RECEIVER_WRIST', now);
      return this.snapshot();
    }

    const goodHands = hands.length === 2 && hands.every((hand) => hand.confidence >= 0.70);
    if (!goodHands) {
      if (this.state !== 'WAIT_FOR_GIVER_HANDS') this.setState('WAIT_FOR_GIVER_HANDS', now);
      return this.snapshot();
    }

    const averagePalmScale = Math.max(0.02, hands.reduce((sum, hand) => sum + hand.palmScale, 0) / hands.length);
    const handSeparation = Math.hypot(hands[0].wrist.x - hands[1].wrist.x, hands[0].wrist.y - hands[1].wrist.y);
    const separationRatio = handSeparation / averagePalmScale;
    const guideDistance = pairGuideDistance(hands);

    if (separationRatio >= 2.0) this.hadHandsApart = true;

    if (this.state === 'WAIT_FOR_GIVER_HANDS') {
      this.setState('POSITIONING', now);
      return this.snapshot();
    }

    if (this.state === 'POSITIONING') {
      if (separationRatio >= 1.8 && separationRatio <= 8.5) {
        if (this.stableSince < 0) this.stableSince = now;
        if (now - this.stableSince >= 220) this.setState('APPROACHING_WRIST', now);
      } else {
        this.stableSince = -1;
      }
      return this.snapshot();
    }

    if (this.state === 'APPROACHING_WRIST') {
      if (guideDistance <= 0.13) {
        if (this.stableSince < 0) this.stableSince = now;
        if (now - this.stableSince >= 260) this.setState('ALIGNMENT_VALID', now);
      } else {
        this.stableSince = -1;
      }
      return this.snapshot();
    }

    if (this.state === 'ALIGNMENT_VALID') {
      if (guideDistance > 0.18) {
        this.setState('APPROACHING_WRIST', now);
      } else if (now - this.stableSince >= 300) {
        this.setState('WAIT_FOR_HAND_CONTACT', now);
      }
      return this.snapshot();
    }

    if (this.state === 'WAIT_FOR_HAND_CONTACT') {
      if (guideDistance > 0.2) {
        this.setState('APPROACHING_WRIST', now);
        return this.snapshot();
      }
      const contact = this.hadHandsApart && separationRatio <= 1.55;
      if (contact) {
        if (this.stableSince < 0) this.stableSince = now;
        if (now - this.stableSince >= 300) this.setState('TYING_GESTURE', now);
      } else {
        this.stableSince = -1;
      }
      return this.snapshot();
    }

    if (this.state === 'TYING_GESTURE') {
      const stillContact = separationRatio <= 1.75 && guideDistance <= 0.2;
      if (!stillContact) {
        this.setState('WAIT_FOR_HAND_CONTACT', now);
        return this.snapshot();
      }
      if (now - this.stableSince >= 350) this.setState('FINISHING_ANIMATION', now);
      return this.snapshot();
    }

    return this.snapshot();
  }
}
