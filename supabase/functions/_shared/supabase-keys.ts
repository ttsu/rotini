/**
 * Reads Supabase API keys injected into Edge Functions as JSON dictionaries.
 *
 * Hosted functions receive `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS`; the `default`
 * entry is the primary project key (replaces legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`).
 *
 * @see https://supabase.com/docs/guides/functions/secrets
 */

/**
 * Returns the default publishable API key (`SUPABASE_PUBLISHABLE_KEYS["default"]`).
 */
export function getDefaultPublishableKey(): string {
  return readNamedKeyFromJsonEnv('SUPABASE_PUBLISHABLE_KEYS', 'default');
}

/**
 * Returns the default secret API key (`SUPABASE_SECRET_KEYS["default"]`).
 */
export function getDefaultSecretKey(): string {
  return readNamedKeyFromJsonEnv('SUPABASE_SECRET_KEYS', 'default');
}

function readNamedKeyFromJsonEnv(envVar: string, keyName: string): string {
  const raw = Deno.env.get(envVar);
  if (!raw) {
    throw new Error(`Missing ${envVar}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${envVar} must be valid JSON`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${envVar} must be a JSON object of named keys`);
  }
  const value = (parsed as Record<string, unknown>)[keyName];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${envVar}["${keyName}"] is missing or not a non-empty string`);
  }
  return value;
}
