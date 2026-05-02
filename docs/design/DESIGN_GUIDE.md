# Rotini Design Guide

Source: exported from Claude Design (claude.ai/design), 2026-04-30.
Prototype files: `Rotini.html` (light) and `Rotini Dark.html` (dark).
Open either HTML file in a browser to navigate the interactive prototype.

---

## Design tokens

```
Background:       #F2F2F7   (iOS system grouped background)
Card:             #FFFFFF
Accent:           #0a7ea4   (teal-blue — matches constants/theme.ts)
Green:            #34C759   (active/on-now)
Amber:            #FF9F0A   (pending/swap request)
Red:              #FF3B30   (destructive/decline)
Text primary:     #000000
Text secondary:   #636366
Text tertiary:    #AEAEB2
Border:           rgba(60,60,67,0.12)
Separator:        rgba(60,60,67,0.1)
```

Dark mode equivalents (from `Rotini Dark.html`):
```
Background:       #000000
Card:             #1C1C1E
Accent:           #2997FF
Green:            #30D158
Amber:            #FF9F0A
Red:              #FF453A
Text primary:     #FFFFFF
Text secondary:   #8E8E93
```

---

## Components

### Cards
- `background: #FFFFFF`, `borderRadius: 18`, `boxShadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`
- Press: `scale(0.97)`, `opacity: 0.85`
- Grouped list style: single white card, items separated by `rgba(60,60,67,0.1)` hairline

### Status pill (Pill)
- Small: colored background at ~10% opacity, 7×7 colored dot (when active), 12px 600-weight text
- Padding: `3px 10px 3px 8px`, border-radius 99

### NavBar
- Background: white/card, 0.5px border-bottom (`rgba(60,60,67,0.1)`), sticky
- Back button: accent color, 17px, chevron SVG icon + "Back"
- Title: 17px, font-weight 600
- Right slot: 60px wide, flex-end

### Large title
- 32px, font-weight 700, letter-spacing −0.5, padding `16px 20px 8px`

### Section header
- 13px, font-weight 600, uppercase, letter-spacing 0.5, tertiary text color
- Padding: `20px 20px 6px`

### Tab bar
- `background: rgba(255,255,255,0.85)`, `backdropFilter: blur(12px)`, 0.5px top border
- Padding: `10px 0 28px` (safe area bottom)
- Active: accent color; inactive: tertiary color

### Buttons (Btn)
- Filled: `background: accent`, `borderRadius: 10`, `padding: 12px 20px`, 16px 600-weight white text
- Outline: `border: 1.5px solid color`, transparent background
- Small variant: `padding: 7px 14px`, 14px

### Scroll-wheel duration picker (WheelColumn)
- Three columns: Days (0–30), Hours (0–23), Mins (0/15/30/45)
- Column width 80px, item height 42px, 5 visible items
- Selection highlight: `background: #F2F2F7`, hairline top/bottom border
- Fade-out gradient top/bottom inside card

---

## Screens

### Home
- **Header**: date string (13px, secondary) + large title "Good morning, [Name]"
- **"Awaiting your reply"** section: amber left-border cards with Accept/Decline buttons
- **"Your shifts"** section: one card per rota the user is in
  - 3px colored status bar at top (green = on now, teal = upcoming)
  - Top row: shift name + status pill ("On now" with dot, or "Your turn")
  - Bottom row: time/date label (20px 700) + countdown (22px 700, colored) + label (11px, tertiary)
  - Only shows the user's own next/current turn (not other people's)

### Shifts list (tab)
- Large title "Shifts" + "+" button (28px, weight 300, accent)
- Grouped white card with all rotas as rows; 0.5px separators
- Each row: 10px status dot (green glow if active), name + role badge, subtitle with current assignee and countdown, metadata (duration · Round-robin)

### Rota detail
- NavBar with "Edit" (owner only)
- **Status banner**: gradient background `${statusColor}22 → ${statusColor}10`, colored border, 20px padding
  - Pill + assignee name (30px 700) + time description + large countdown (36px 700, colored)
- **Details card**: Duration, Assignment rows (no Timezone — move to settings)
- **Schedule section**: occurrence cards with active border, assignee name (accent if me), date·time range, chevron
- **Members section**: avatar circle (34px), name + position, role badge
- **Owner actions**: "+ Invite member" filled + "+ Viewer" outline

### Occurrence detail
- NavBar "Occurrence"
- **Status card**: gradient bg, pill, "Your turn" / "[Name]'s turn" (28px 700), date·time, countdown if active
- **Rota context card**: "Shift" label + name + duration
- **Actions**: "Request a swap" (if mine), "Mark as done" (if active+mine), "Override assignment" (if owner+not mine)

### Swap sheet (bottom sheet)
- Handle bar, "Request a swap" title, context subtitle
- Member chips (pill buttons) to select target
- Optional message textarea
- "Send request" button; sent state: green checkmark + "Request sent" + Done button

### Create shift flow (3 screens)

**Basics screen** (NavBar "New Shift", "Next" right — disabled until name filled):
- Name: underline text input (borderBottom only), 17px
- Description: underline textarea, optional
- Schedule row: white card button showing rrule description, chevron → opens RecurrenceBuilder
- Duration: "Back to back" toggle card first, then scroll-wheel picker (Days/Hours/Mins) when not back-to-back
- Note: "Must be shorter than the gap between occurrences."

**Recurrence builder** (sub-screen, NavBar "Schedule"):
- Segmented control: daily / weekly / monthly
- Weekly: day chips (M T W T F S S, 40×40 circles), "Repeat every N weeks" stepper
- Daily: "Repeat every N days" stepper
- Monthly: "Day of month" / "Day of week" toggle, then stepper or fixed text
- Preview box: accent background + left border, shows human-readable description

**Members step** (NavBar "Members", "Create" right):
- Shift summary card (accent tinted bg)
- "Rotation order" heading + "Drag to reorder" hint
- Draggable list: drag handle (2×3 dot grid), position badge (accent circle), avatar, name+email, "first turn" date (calculated from rrule)
- Add member: email input + "Add" button
- "Create shift" primary button + "Skip for now" secondary

### Settings
- Large title "Settings"
- **Profile card**: 52px avatar circle (accent bg, initial letter), name (17px 600) + email
- **Preferences**: grouped card with "Notifications" and "Default time zone" rows, chevrons
- **Sign out**: full-width white card button, red text

---

## Navigation

- Tab navigation: Home / Shifts / Settings (3 tabs)
- From Home/Shifts: tap card → Rota Detail
- From Rota Detail: tap occurrence row → Occurrence Detail
- From Occurrence Detail: tap "Request a swap" → Swap Sheet (bottom sheet)
- From Shifts tab: tap "+" → Create Shift flow (stack: Basics → Recurrence Builder | Members)
- Transitions: slide left/right (28ms cubic-bezier), sheet slides up from bottom

---

## Key design decisions (from chat transcripts)

- "Rota" renamed to "Shift" everywhere in the UI
- Home cards show **only the user's own next turn** (not current assignee if it's someone else)
- Timezone is **not** shown on cards or occurrence rows; only in Settings
- Round-robin is assumed; no assignment mode selector
- Duration uses scroll-wheel picker (Days/Hours/Mins drums), not chips
- Rotation order set via drag-to-sort in the Members step, with projected first-turn dates
