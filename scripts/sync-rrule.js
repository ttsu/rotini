#!/usr/bin/env node
/**
 * Regenerates supabase/functions/_shared/rrule.ts from lib/rrule.ts.
 *
 * Strips Node-only code (Zod schema, WEEKDAY_CODES array, toRRule, validateDuration)
 * and rewrites npm imports as esm.sh URLs for Deno compatibility.
 *
 * Usage: npm run sync-rrule
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let out = fs.readFileSync(path.join(root, 'lib/rrule.ts'), 'utf8');

// 1. Rewrite npm imports → esm.sh
out = out.replace("import { RRule } from 'rrule';", "import { RRule } from 'https://esm.sh/rrule@2';");
out = out.replace(
  "import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';",
  "import { formatInTimeZone, fromZonedTime } from 'https://esm.sh/date-fns-tz@3';"
);

// 2. Remove Zod import
out = out.replace(/^import \{ z \} from 'zod';\n/m, '');

// 3. Remove WEEKDAY_CODES array constant (single-line)
out = out.replace(/^export const WEEKDAY_CODES = \[.*?\] as const;\n/m, '');

// 4. Replace Zod-derived WeekdayCode with an explicit union
out = out.replace(
  /^export type WeekdayCode = \(typeof WEEKDAY_CODES\)\[number\];$/m,
  "export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';"
);

// 5. Remove rruleParamsSchema (multi-line discriminated union ending with `]);`)
out = out.replace(/^export const rruleParamsSchema[\s\S]*?^\]\);\n/m, '');

// 6. Replace Zod-derived RRuleParams with a local type definition
out = out.replace(
  /^export type RRuleParams = z\.infer<typeof rruleParamsSchema>;\n/m,
  [
    "type RRuleParams =",
    "  | { freq: 'DAILY'; interval: number }",
    "  | { freq: 'WEEKLY'; interval: number; byday: WeekdayCode[] }",
    "  | { freq: 'MONTHLY'; interval: number; bymonthday?: number; byday?: WeekdayCode; bysetpos?: number };\n",
  ].join('\n')
);

// 7. Remove toRRule function (closing `}` is at column 0)
out = out.replace(/^export function toRRule\([\s\S]*?^}\n/m, '');

// 8. Remove validateDuration (with its JSDoc block at the end of the file)
out = out.replace(/\n\/\*\*\n \* Returns an error message if duration_minutes[\s\S]*$/, '\n');

// 9. WEEKDAY_MAP: remove `as const`, add Record<WeekdayCode, any> type annotation
out = out.replace(/^(const WEEKDAY_MAP) = \{/m, '$1: Record<WeekdayCode, any> = {');
out = out.replace(/^} as const;\n/m, '};\n');

// 10. Re-export formatInTimeZone so edge functions don't need a second import
const firstSectionMarker = out.indexOf('\n// ─── Types');
if (firstSectionMarker === -1) {
  throw new Error('sync-rrule: could not find section marker "// ─── Types" in lib/rrule.ts');
}
out =
  out.slice(0, firstSectionMarker) +
  '\nexport { formatInTimeZone };\n' +
  out.slice(firstSectionMarker);

// 11. Replace the lib-specific file header with a generated-file notice
out = out.replace(
  /^\/\*\*\n \* RRULE utilities for rotini[\s\S]*?\*\/\n/m,
  '/** AUTO-GENERATED from lib/rrule.ts — run `npm run sync-rrule` to regenerate. */\n' +
  '// deno-lint-ignore-file no-explicit-any\n'
);

// 12. Collapse 3+ blank lines down to 2
out = out.replace(/\n{3,}/g, '\n\n');

const dest = path.join(root, 'supabase/functions/_shared/rrule.ts');
fs.writeFileSync(dest, out);
console.log('✓  supabase/functions/_shared/rrule.ts regenerated from lib/rrule.ts');
