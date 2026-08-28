import type { VisionFeatures } from '../types/vision';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';

export type CeremonyRole = 'GIVER' | 'RECEIVER';
export type ActiveRitual = 'AARTI' | 'TILAK' | 'RAKHI' | null;

export interface CeremonyVisionState {
  faceActivated: boolean;
  giverHandsActive: boolean;
  rakhiState: RakhiTyingState;
}

export const deriveNetworkVisionFeatures = (
  role: CeremonyRole,
  state: CeremonyVisionState,
): VisionFeatures => ({
  face: role === 'RECEIVER' && state.faceActivated,
  // Landmark translation complements the VTO tracker's 3D rotation.
  wrist: role === 'RECEIVER' && state.rakhiState !== 'IDLE',
  hands: role === 'GIVER' && state.giverHandsActive,
});

export const parseCallDurationSeconds = () => {
  const query = new URLSearchParams(window.location.search).get('duration');
  const querySeconds = query ? Number(query) : Number.NaN;
  const envSeconds = Number(import.meta.env.VITE_DEBUG_CALL_DURATION ?? Number.NaN);
  const chosen = Number.isFinite(querySeconds) ? querySeconds : envSeconds;
  if (Number.isFinite(chosen) && chosen >= 30 && chosen <= 1200) return Math.floor(chosen);
  return 20 * 60;
};

export const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};
