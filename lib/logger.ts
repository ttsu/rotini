/**
 * Logs auth-related diagnostics in development only.
 *
 * @param args - Values passed to `console.log`
 */
export function authDebugLog(...args: unknown[]): void {
  if (__DEV__) {
    console.log(...args);
  }
}
