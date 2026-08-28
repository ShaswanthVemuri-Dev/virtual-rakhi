import type { FaceAnchor, NormalizedHand, Phase1Frame, WristAnchor } from '../types/vision';
import type { Retained } from '../vision/trackingRetention';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';
import { retargetHandsToWrist } from '../rakhi/handRetargeting';
import { drawHandShadow } from './handShadowRenderer';
import { TilakRenderer } from './tilakRenderer';
import { AartiRenderer } from './aartiRenderer';
import { TilakHandRenderer } from './tilakHandRenderer';

export interface CeremonyRenderOptions {
  tilakApplied: boolean;
  rakhiAttached: boolean;
  aartiProgress: number | null;
  tilakProgress: number | null;
  frozenWrist: WristAnchor | null;
  rakhiState: RakhiTyingState;
  mirrored?: boolean;
}

const activeHandStates = new Set<RakhiTyingState>([
  'WAIT_FOR_GIVER_HANDS',
  'POSITIONING',
  'APPROACHING_WRIST',
  'ALIGNMENT_VALID',
  'FINISHING_ANIMATION',
]);

export class CeremonyRenderer {
  private tilak = new TilakRenderer();
  private aarti = new AartiRenderer();
  private tilakHand = new TilakHandRenderer();

  draw(
    canvas: HTMLCanvasElement,
    frame: Phase1Frame,
    face: Retained<FaceAnchor>,
    wrist: Retained<WristAnchor>,
    options: CeremonyRenderOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mirrored = options.mirrored ?? true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (options.aartiProgress !== null) this.aarti.draw(ctx, options.aartiProgress);

    if (options.tilakProgress !== null && face.value) {
      const reveal = Math.max(0, Math.min(1, (options.tilakProgress - .42) / .24));
      if (reveal > 0) this.tilak.draw(ctx, face.value, 1, mirrored, reveal * reveal * (3 - 2 * reveal));
      this.tilakHand.draw(ctx, face.value, options.tilakProgress, mirrored);
    } else if (options.tilakApplied && face.value) {
      this.tilak.draw(ctx, face.value, face.alpha, mirrored);
    }

    const targetWrist = options.frozenWrist ?? wrist.value;
    if (activeHandStates.has(options.rakhiState) && targetWrist) {
      this.drawRetargetedHands(ctx, frame.normalizedHands, targetWrist, options.rakhiState, mirrored);
    }

  }

  private drawRetargetedHands(
    ctx: CanvasRenderingContext2D,
    hands: NormalizedHand[],
    wrist: WristAnchor,
    state: RakhiTyingState,
    mirrored: boolean,
  ) {
    const fade = state === 'FINISHING_ANIMATION' ? 0.2 : 0.48;
    retargetHandsToWrist(hands, wrist).forEach((points) => {
      drawHandShadow(ctx, points, { mirror: mirrored, alpha: fade });
    });
  }

}
