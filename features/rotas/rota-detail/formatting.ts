export { formatCountdown, toTestIdSegment } from '../../../lib/formatting';

export function formatDuration(minutes: number | null, backToBack: boolean): string {
  if (backToBack) return 'Back to back';
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) return `${minutes / 60} hours`;
  if (minutes === 1440) return '1 day';
  if (minutes === 10080) return '1 week';
  return `${minutes} min`;
}
