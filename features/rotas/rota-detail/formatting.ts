/**
 * Formats rota duration for display.
 *
 * @param minutes - Duration in minutes, or null when back-to-back
 * @param backToBack - Whether shifts run back-to-back
 */
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

/**
 * Short human-readable countdown until `targetIso`.
 *
 * @param targetIso - ISO timestamp
 */
export function formatCountdown(targetIso: string): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const totalMins = Math.floor(diff / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return 'soon';
}

/**
 * Normalizes a string for stable test IDs.
 *
 * @param value - Display string (e.g. member name)
 */
export function toTestIdSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
