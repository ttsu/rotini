import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

export type ParsedInviteContact =
  | { ok: true; channel: 'email'; email: string }
  | { ok: true; channel: 'phone'; phoneE164: string }
  | { ok: false; message: string };

/**
 * Parses a single "email or phone" field for targeted invites.
 * Phone numbers must include a country code (E.164 with leading +).
 */
export function parseInviteContact(raw: string): ParsedInviteContact {
  const s = raw.trim();
  if (!s) {
    return { ok: false, message: 'Enter an email or phone number' };
  }

  if (s.includes('@')) {
    const r = z.string().trim().email().safeParse(s);
    if (!r.success) {
      return { ok: false, message: 'Invalid email address' };
    }
    return { ok: true, channel: 'email', email: s.toLowerCase() };
  }

  const digits = s.replace(/\s/g, '');
  const normalized = digits.startsWith('+') ? digits : `+${digits}`;
  const phone = parsePhoneNumberFromString(normalized);
  if (!phone?.isValid()) {
    return {
      ok: false,
      message: 'Invalid phone — include country code (e.g. +44 7911 123456)',
    };
  }
  return { ok: true, channel: 'phone', phoneE164: phone.format('E.164') };
}
