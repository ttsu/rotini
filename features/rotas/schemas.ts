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
  // "YYYY-MM-DDTHH:MM" local time in the selected tz — converted to UTC before DB insert
  dtstart: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Invalid start date/time'),
  rrule: z.string().min(1, 'Schedule is required'),
  back_to_back: z.boolean(),
  duration_minutes: z.number().int('Must be a whole number').positive('Must be positive').optional(),
  assignment_mode: z.enum(['round_robin']),
}).superRefine((data, ctx) => {
  if (!data.back_to_back && data.duration_minutes == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Duration is required',
      path: ['duration_minutes'],
    });
  }
  if (data.back_to_back && data.duration_minutes != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Cannot set both duration and back-to-back',
      path: ['duration_minutes'],
    });
  }
});

export type CreateRotaValues = z.infer<typeof createRotaSchema>;
