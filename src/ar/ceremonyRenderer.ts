import type { FaceAnchor, NormalizedHand, Phase1Frame, WristAnchor } from '../types/vision';
import type { Retained } from '../vision/trackingRetention';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';
import { restoreHandsToCanvas } from '../rakhi/handRetargeting';
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
  handMirrored?: boolean;
  handAlpha?: number;
}

const activeHandStates = new Set<RakhiTyingState>([
  'WAIT_FOR_GIVER_HANDS',
  'POSITIONING',
  'APPROACHING_WRIST',
  'ALIGNMENT_VALID',
  'WAIT_FOR_HAND_CONTACT',
  'TYING_GESTURE',
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
    const handMirrored = options.handMirrored ?? mirrored;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (options.aartiProgress !== null) this.aarti.draw(ctx, options.aartiProgress);

    if (options.tilakProgress !== null && face.value) {
      const reveal = Math.max(0, Math.min(1, (options.tilakProgress - .42) / .24));
      if (reveal > 0) this.tilak.draw(ctx, face.value, 1, mirrored, reveal * reveal * (3 - 2 * reveal));
      this.tilakHand.draw(ctx, face.value, options.tilakProgress, mirrored);
    } else if (options.tilakApplied && face.value) {
      this.tilak.draw(ctx, face.value, face.alpha, mirrored);
    }

    // The sister's hands belong to the shared canvas, not the wrist tracker.
    // A brief receiver-wrist miss must never hide an otherwise valid hand feed.
    if ((activeHandStates.has(options.rakhiState) || options.handAlpha !== undefined)
      && frame.normalizedHands.length) {
      this.drawHands(ctx, frame.normalizedHands, options.rakhiState, handMirrored, options.handAlpha);
    }

  }

  private drawHands(
    ctx: CanvasRenderingContext2D,
    hands: NormalizedHand[],
    state: RakhiTyingState,
    mirrored: boolean,
    handAlpha?: number,
  ) {
    const fade = (handAlpha ?? (state === 'FINISHING_ANIMATION' ? .55 : 1)) * .48;
    restoreHandsToCanvas(hands).forEach((points) => {
      drawHandShadow(ctx, points, { mirror: mirrored, alpha: fade });
    });
  }

}
