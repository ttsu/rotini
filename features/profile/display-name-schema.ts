import { z } from 'zod';

/** Shared validation for profile display name (onboarding + Edit Profile). */
export const displayNameSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(60, 'Name must be 60 characters or less'),
});

export type DisplayNameFormValues = z.infer<typeof displayNameSchema>;
