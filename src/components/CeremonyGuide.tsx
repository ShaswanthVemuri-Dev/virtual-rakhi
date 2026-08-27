import type { ActiveRitual } from '../app/ceremonyState';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';

export default function CeremonyGuide({
  activeRitual,
  rakhiState,
  instruction,
  progress,
  status,
  nextStep = 'Begin with Aarti.',
}: {
  activeRitual: ActiveRitual;
  rakhiState: RakhiTyingState;
  instruction: string;
  progress: number;
  status: string;
  nextStep?: string;
}) {
  if (!activeRitual && rakhiState !== 'RAKHI_ATTACHED') {
    return <div className="ceremony-guide talk-guide"><div className="guide-kicker">YOUR NEXT STEP</div><strong>{nextStep}</strong><span>The next action unlocks after this step is complete.</span></div>;
  }
  return (
    <div className="ceremony-guide">
      <div className="guide-kicker">{activeRitual === 'RAKHI' || rakhiState === 'RAKHI_ATTACHED' ? `RAKHI · ${rakhiState.replaceAll('_', ' ')}` : activeRitual ?? 'RAKHI COMPLETE'}</div>
      <strong>{instruction}</strong>
      {status && <span>{status}</span>}
      {(activeRitual === 'RAKHI' || rakhiState === 'RAKHI_ATTACHED') && (
        <div className="guide-progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      )}
    </div>
  );
}
