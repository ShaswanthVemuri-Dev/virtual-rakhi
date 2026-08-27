import type { ActiveRitual, CeremonyRole } from '../app/ceremonyState';

interface Props {
  role: CeremonyRole;
  activeRitual: ActiveRitual;
  tilakApplied: boolean;
  rakhiAttached: boolean;
  aartiComplete: boolean;
  disabled?: boolean;
  onAarti: () => void;
  onTilak: () => void;
  onRakhi: () => void;
  onBlessing: () => void;
}

export default function CeremonyControls(props: Props) {
  const busy = props.disabled || props.activeRitual !== null;
  return (
    <div className="ceremony-controls">
      {props.role === 'GIVER' && (
        <>
          <button disabled={busy || props.aartiComplete} onClick={props.onAarti}>{props.aartiComplete ? 'Aarti ✓' : 'Aarti'}</button>
          <button disabled={busy || !props.aartiComplete || props.tilakApplied} onClick={props.onTilak}>{props.tilakApplied ? 'Tilak ✓' : 'Tilak'}</button>
          <button disabled={busy || !props.tilakApplied || props.rakhiAttached} onClick={props.onRakhi}>{props.rakhiAttached ? 'Rakhi ✓' : 'Rakhi'}</button>
        </>
      )}
      <button className="blessing-button" disabled={busy || !props.rakhiAttached} onClick={props.onBlessing}>Blessing</button>
    </div>
  );
}
