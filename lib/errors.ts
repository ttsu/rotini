/**
 * Returns a short message suitable for alerts and inline error UI.
 *
 * @param error - Any thrown value from Supabase, fetch, or application code
 * @returns Human-readable message
 */
export function getUserMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Something went wrong. Please try again.';
  }
  if (typeof error === 'string') {
    return error.trim() || 'Something went wrong. Please try again.';
  }
  if (error instanceof Error) {
    const m = error.message.trim();
    return m || 'Something went wrong. Please try again.';
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return 'Something went wrong. Please try again.';
}
