import { z } from 'zod';

export const DURATION_PRESETS = [
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '1 day', minutes: 1440 },
  { label: '1 week', minutes: 10080 },
] as const;

export const COMMON_TIMEZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Halifax',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Athens',
  'Europe/Moscow',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

export const createRotaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Max 80 characters').trim(),
  description: z.string().max(280, 'Max 280 characters').trim().optional(),
  tz: z.string().min(1, 'Timezone is required'),
  duration_minutes: z.number().int('Must be a whole number').positive('Must be positive'),
  assignment_mode: z.enum(['round_robin', 'fixed']),
});

export type CreateRotaValues = z.infer<typeof createRotaSchema>;
