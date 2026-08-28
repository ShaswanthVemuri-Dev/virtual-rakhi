import { formatDuration } from '../app/ceremonyState';

export default function Timer({ remaining }: { remaining: number }) {
  const warning = remaining <= 60 ? 'critical' : remaining <= 300 ? 'warning' : '';
  return (
    <div className={`ceremony-timer ${warning}`}>
      <span>Time left</span>
      <strong>{formatDuration(remaining)}</strong>
    </div>
  );
}
