import { formatDuration } from '../app/ceremonyState';

export default function Timer({ remaining, total }: { remaining: number; total: number }) {
  const warning = remaining <= 60 ? 'critical' : remaining <= 300 ? 'warning' : '';
  return (
    <div className={`ceremony-timer ${warning}`}>
      <span>TIME LEFT</span>
      <strong>{formatDuration(remaining)}</strong>
      {total !== 1800 && <em>DEBUG {formatDuration(total)}</em>}
    </div>
  );
}
