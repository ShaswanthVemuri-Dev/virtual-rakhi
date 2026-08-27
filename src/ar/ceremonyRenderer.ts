import type { FaceAnchor, NormalizedHand, Phase1Frame, WristAnchor } from '../types/vision';
import type { Retained } from '../vision/trackingRetention';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';
import { retargetHand } from '../rakhi/handRetargeting';
import { drawHandShadow } from './handShadowRenderer';
import { TilakRenderer } from './tilakRenderer';
import { RakhiRenderer } from './rakhiRenderer';
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
  use3dRakhi?: boolean;
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
  private rakhi = new RakhiRenderer();
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
      this.tilakHand.draw(ctx, face.value, options.tilakProgress, mirrored);
      if (options.tilakProgress >= 0.56) {
        const alpha = Math.min(1, (options.tilakProgress - 0.56) / 0.16);
        this.tilak.draw(ctx, face.value, alpha, mirrored);
      }
    } else if (options.tilakApplied && face.value) {
      this.tilak.draw(ctx, face.value, face.alpha, mirrored);
    }

    const targetWrist = options.frozenWrist ?? wrist.value;
    if (activeHandStates.has(options.rakhiState) && targetWrist) {
      this.drawRetargetedHands(ctx, frame.normalizedHands, targetWrist, options.rakhiState, mirrored);
    } else if (options.rakhiAttached && wrist.value && !options.use3dRakhi) {
      this.rakhi.drawWrapped(ctx, wrist.value, wrist.alpha, mirrored);
    }

  }

  private drawRetargetedHands(
    ctx: CanvasRenderingContext2D,
    hands: NormalizedHand[],
    wrist: WristAnchor,
    state: RakhiTyingState,
    mirrored: boolean,
  ) {
    const targetScale = Math.max(0.045, wrist.scale * 0.42);
    const fade = state === 'FINISHING_ANIMATION' ? 0.2 : 0.48;
    const retargeted = hands.map((hand) => {
      const points = retargetHand(hand, {
        x: wrist.x,
        y: wrist.y,
        palmScale: targetScale,
        angle: wrist.angle - Math.PI / 2,
        motionGain: 0.92,
      });
      drawHandShadow(ctx, points, { mirror: mirrored, alpha: fade });
      return points;
    });
    if (state === 'FINISHING_ANIMATION') this.rakhi.drawWrapped(ctx, wrist, 1, mirrored);
    else this.rakhi.drawCarried(ctx, retargeted, wrist, 0.95, mirrored);
  }

}
