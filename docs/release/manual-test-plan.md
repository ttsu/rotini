# Manual test plan

Use this plan to test Rotini against the current app and the product contract in
`[docs/plan/SPEC.md](../plan/SPEC.md)`. It is intentionally manual because many
flows need multiple users, real devices, Supabase services, push credentials, and
time-sensitive recurrence behavior.

## How to record a run

1. Copy this file's "Run record" section into a new issue, PR comment, or notes
  document before testing.
2. For each test case, change `Result: UNTESTED` to `PASS`, `FAIL`, or `BLOCKED`.
3. Check each completed step with `[x]`.
4. If a step fails, add an `ISSUE-###` entry in "Issue log" and add that ID to
  the test case's `Issue IDs`.
5. Keep failures factual. Include the environment, exact user, expected result,
  actual result, and reproduction steps.

Agents should treat `FAIL` and `BLOCKED` cases plus the "Issue log" as the source
of truth for follow-up planning.

## Run record

Run ID: `YYYY-MM-DD-initials-platform-build`

Build:

- App version:
- Git SHA:
- EAS profile or local dev:
- Supabase project:
- Edge functions deployed: `materialize-rota`, `dispatch-notifications`
- Migrations applied through:

Devices:

- iOS device and OS:
- Android device and OS:
- Simulator/emulator, if used:

Test accounts:

- User A, owner: ``
- User B, member: ``
- User C, viewer: ``
- User D, outsider: ``

Services verified before testing:

- Supabase URL and anon key are configured.
- Magic link redirect URLs include the app scheme and Expo dev URL.
- Google provider is configured, if testing Google sign-in.
- Apple provider is configured, if testing Apple sign-in.
- Supabase Realtime is enabled for required tables.
- `pg_cron`, `pg_net`, and Vault `service_role_key` are configured.
- Edge function URLs in cron migrations point at this Supabase project.
- Expo project ID and push credentials are configured for device builds.

## Issue log

Use this exact shape for every failure or blocker.

```text
ISSUE-001
Status: OPEN
Severity: S1 | S2 | S3 | S4
Test IDs: []
Environment:
User:
Expected:
Actual:
Repro steps:
Evidence:
Suspected area:
Notes:
```

Severity guide:

- `S1`: Data loss, security/privacy issue, auth break, app unusable, or crash on
a primary path.
- `S2`: Primary feature broken with no reasonable workaround.
- `S3`: Feature works with a workaround, important polish issue, or confusing UX.
- `S4`: Cosmetic issue, copy issue, or low-risk edge case.

## Expected spec gaps to track

The current app appears to implement most core MVP flows, but these spec items
should be tested and recorded as expected failures if still absent:

- Rota edit UI is in the spec but only creation is visible.
- Mark done is in the occurrence spec but no visible action appears in the
current occurrence screen.
- Email-targeted invites are in the data model, but the current UI creates link
invites only.
- Create rota stores a time zone, but the current form appears to use the device
time zone without an explicit time zone picker.
- Settings shows "Default time zone", but the row does not appear to perform an
action.
- Home is specified as a status card for every rota the user belongs to. The
current Home screen appears focused on the user's own assigned shifts.
- Full offline mutation queue is out of scope for v1; only cached reads should
work offline.

## Test data to create

Create these rotas during the run unless a seeded database already provides them.

- `Weekly Chores`: weekly Monday, 1 hour, owner User A, member User B, viewer
User C.
- `Daily Back-to-Back`: daily, back-to-back duration, owner User A, member User B.
- `Monthly Billing`: monthly day of month, owner User A, member User B.
- `Last Friday Ops`: monthly nth weekday, owner User A, member User B.
- `Near Boundary`: starts within the next 5 minutes and lasts 5 to 10 minutes,
for countdown and active/upcoming boundary checks.
- `Reminder Check`: starts far enough in the future to add a short reminder and
observe notification job creation and dispatch.

## 1. Auth and onboarding

### AUTH-01 Route guard and signed-out state

Coverage: unauthenticated redirect, auth shell, protected tabs.
Personas: User A signed out.
Result: UNTESTED
Issue IDs: []

Steps:

- Fresh install or sign out, then launch the app.
  - Expected: The app lands on the sign-in screen, not Home, Rotas, Settings, or
  a protected detail route.
  - Observed:
- Try opening a protected deep link such as `rotini://rotas`.
  - Expected: The app redirects to sign-in.
  - Observed:
- Background and foreground the app while signed out.
  - Expected: The app remains signed out with no protected data flashed.
  - Observed:

### AUTH-02 Magic link sign-in

Coverage: magic link request, auth callback, session exchange.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Enter User A's email and tap "Send magic link".
  - Expected: A confirmation alert appears and the button does not submit twice.
  - Observed:
- Open the magic link on the same device.
  - Expected: The app opens, exchanges the code, and proceeds to onboarding or
  tabs depending on profile state.
  - Observed:
- Relaunch the app after successful sign-in.
  - Expected: The session is restored.
  - Observed:
- Try a blank email.
  - Expected: No request is sent and the UI remains stable.
  - Observed:
- Try a malformed email.
  - Expected: The app handles Supabase's response without crashing and gives a
  useful retry path.
  - Observed:

### AUTH-03 Google sign-in

Coverage: Google OAuth, Supabase `signInWithIdToken`.
Personas: User B.
Result: UNTESTED
Issue IDs: []

Steps:

- On a physical device, tap "Continue with Google".
  - Expected: Google auth opens and returns to Rotini.
  - Observed:
- Complete Google sign-in.
  - Expected: The app creates or resumes a Supabase session and routes to
  onboarding or tabs.
  - Observed:
- Cancel the Google auth flow.
  - Expected: Loading clears and the sign-in screen remains usable.
  - Observed:
- Test with missing or invalid Google client IDs in a non-production build.
  - Expected: The app reports a recoverable failure and does not crash.
  - Observed:

### AUTH-04 Apple sign-in

Coverage: Apple auth on iOS, Supabase `signInWithIdToken`.
Personas: User C.
Result: UNTESTED
Issue IDs: []

Steps:

- On a physical iPhone, tap "Sign in with Apple".
  - Expected: Native Apple auth appears.
  - Observed:
- Complete Apple sign-in.
  - Expected: The app creates or resumes a Supabase session.
  - Observed:
- Cancel Apple sign-in.
  - Expected: Loading clears without an error alert for user cancellation.
  - Observed:
- Verify the Apple button is not shown on Android.
  - Expected: Android only shows magic link and Google options.
  - Observed:

### AUTH-05 Onboarding profile

Coverage: profile creation, display name validation, post-auth routing.
Personas: new User A, B, C.
Result: UNTESTED
Issue IDs: []

Steps:

- Sign in with a new account that has no `profiles.display_name`.
  - Expected: The app routes to the onboarding profile screen.
  - Observed:
- Submit an empty display name.
  - Expected: "Name is required" appears and no profile is saved.
  - Observed:
- Submit a name longer than 60 characters.
  - Expected: A max-length error appears.
  - Observed:
- Submit a valid display name.
  - Expected: The profile is upserted, status becomes authenticated, and the app
  routes to tabs.
  - Observed:
- Relaunch the app.
  - Expected: The user skips onboarding and lands in the app.
  - Observed:

### AUTH-06 Sign out and token cleanup

Coverage: Settings sign out, auth state reset, push token deregistration.
Personas: authenticated User A on a physical device.
Result: UNTESTED
Issue IDs: []

Steps:

- Navigate to Settings and tap "Sign out".
  - Expected: The app returns to sign-in.
  - Observed:
- Relaunch the app.
  - Expected: The app remains signed out.
  - Observed:
- If push was enabled, inspect `push_tokens` for the device token.
  - Expected: The token is removed on sign-out.
  - Observed:

### AUTH-07 Invite link while signed out or onboarding

Coverage: invite deep link, auth gate, onboarding gate.
Personas: User A creates invite; User B is signed out; User C has no profile.
Result: UNTESTED
Issue IDs: []

Steps:

- As User A, create a member invite link.
  - Expected: A `rotini://invite/{code}` link is copied and shown.
  - Observed:
- Sign out User B and open the invite link.
  - Expected: The app routes to sign-in and preserves enough context to accept
  the invite after authentication.
  - Observed:
- Complete sign-in as User B.
  - Expected: User B can accept the original invite and lands on the rota.
  - Observed:
- Open an invite as a signed-in user who still needs onboarding.
  - Expected: The app completes onboarding and then allows invite acceptance.
  - Observed:

## 2. App shell, navigation, and settings

### SHELL-01 Tabs, stacks, and empty states

Coverage: Home, Shifts, Settings tabs, rota stack navigation.
Personas: User A with no rotas, then with rotas.
Result: UNTESTED
Issue IDs: []

Steps:

- Sign in as a user with no rota memberships.
  - Expected: Home shows an empty shifts state with a create action.
  - Observed:
- Open the Shifts tab.
  - Expected: The list shows an empty state and a create action.
  - Observed:
- Tap both create actions.
  - Expected: Both navigate to the new rota screen.
  - Observed:
- Use native back gestures/buttons through New Rota, Rota Detail, and
Occurrence Detail.
  - Expected: Navigation is predictable and does not leave duplicate screens.
  - Observed:
- Confirm tab labels and route titles use the product language consistently.
  - Expected: Any mismatch between "rota" and "shift" is intentional and clear.
  - Observed:

### SHELL-02 Loading, retry, and recoverable errors

Coverage: query loading states and `ErrorState` retry paths.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Launch the app on a slow network.
  - Expected: Loading indicators appear without layout jumps or stale flashes.
  - Observed:
- Temporarily break network access, then open Home, Shifts, and a rota detail.
  - Expected: Cached data appears when available; otherwise a clear retry state
  appears.
  - Observed:
- Restore network and tap retry.
  - Expected: Data reloads without requiring an app restart.
  - Observed:

### SETTINGS-01 Profile and appearance

Coverage: Settings profile card, light/dark/system preference persistence.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Open Settings.
  - Expected: Display name and email match User A.
  - Observed:
- Switch Appearance to Dark.
  - Expected: The whole app switches to dark styling.
  - Observed:
- Switch Appearance to Light.
  - Expected: The whole app switches to light styling.
  - Observed:
- Switch Appearance to System, then change OS appearance.
  - Expected: The app follows the system setting.
  - Observed:
- Kill and relaunch the app.
  - Expected: The selected appearance preference persists.
  - Observed:

### SETTINGS-02 Notifications setting row

Coverage: notification permission display and settings link.
Personas: User A on physical iOS and Android devices.
Result: UNTESTED
Issue IDs: []

Steps:

- Open Settings after denying notification permission.
  - Expected: Notifications displays `Denied` and tapping opens OS settings.
  - Observed:
- Grant notification permission in OS settings and return to Rotini.
  - Expected: The row updates to `Allowed`, or updates after relaunch if the app
  only checks on mount.
  - Observed:
- Open Settings with permission already granted.
  - Expected: The row displays `Allowed` and does not misleadingly show an action.
  - Observed:

### SETTINGS-03 Default time zone row

Coverage: Settings default time zone surface.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Tap "Default time zone".
  - Expected: A shipped feature should open a picker or explain that the setting
  is unavailable.
  - Observed:
- Relaunch and create a rota.
  - Expected: Any default time zone choice is reflected in rota creation, or the
  absence of this feature is recorded as a spec gap.
  - Observed:

## 3. Rota creation and recurrence

### ROTA-CREATE-01 Basic validation

Coverage: new rota form, required fields, max lengths.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Open New Rota and submit with an empty name.
  - Expected: "Name is required" appears.
  - Observed:
- Enter a name longer than 80 characters.
  - Expected: A max-length error appears or submission is blocked.
  - Observed:
- Enter a description longer than 280 characters.
  - Expected: A max-length error appears or submission is blocked.
  - Observed:
- Enter a valid name and optional description.
  - Expected: The form can be submitted after schedule and duration are valid.
  - Observed:
- Double tap "Create Shift".
  - Expected: Only one rota is created.
  - Observed:

### ROTA-CREATE-02 Weekly rota creation and materialization

Coverage: weekly RRULE, fixed duration, edge function materialization.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Create `Weekly Chores` with weekly Monday recurrence and 1 hour duration.
  - Expected: Creation succeeds and navigates to the new rota detail screen.
  - Observed:
- Inspect the detail screen.
  - Expected: Duration displays 1 hour, assignment displays round-robin, and User
  A appears as owner/member in the members list.
  - Observed:
- Inspect upcoming occurrences.
  - Expected: Future occurrences are generated for the next 90 days server-side,
  and the detail screen shows the next 30 days.
  - Observed:
- Confirm the first generated occurrence has `ends_at` one hour after
`scheduled_at`.
  - Expected: No occurrence windows overlap.
  - Observed:

### ROTA-CREATE-03 Daily recurrence and overlap validation

Coverage: daily RRULE, duration validator, server-side validator.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Configure a daily rota with duration shorter than 24 hours.
  - Expected: The duration is accepted.
  - Observed:
- Configure a daily rota with duration of 1 day or longer, with
back-to-back disabled.
  - Expected: The form blocks submission with an overlap message.
  - Observed:
- Attempt the same invalid configuration through any direct API/debug path
available in the test environment.
  - Expected: `materialize-rota` rejects it server-side.
  - Observed:

### ROTA-CREATE-04 Back-to-back duration

Coverage: back-to-back toggle, null fixed duration, occurrence end boundaries.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Create `Daily Back-to-Back` with the back-to-back toggle enabled.
  - Expected: Duration picker hides and creation succeeds.
  - Observed:
- Inspect the detail screen.
  - Expected: Duration displays `Back to back`.
  - Observed:
- Inspect generated occurrences.
  - Expected: Each occurrence ends exactly when the next one starts.
  - Observed:
- Turn the app offline and reopen the rota detail after it has loaded once.
  - Expected: Cached rota and occurrence data remain readable.
  - Observed:

### ROTA-CREATE-05 Monthly day-of-month recurrence

Coverage: monthly BYMONTHDAY builder and preview.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Open Schedule, select Monthly, Day of month, and choose day 1.
  - Expected: The summary and preview show monthly occurrences on day 1.
  - Observed:
- Change the interval to every 2 months.
  - Expected: The RRULE summary and preview update.
  - Observed:
- Create `Monthly Billing`.
  - Expected: Occurrences match the selected local date and time.
  - Observed:
- Try to select day 29, 30, or 31.
  - Expected: The UI either does not expose unsafe days or handles them clearly.
  - Observed:

### ROTA-CREATE-06 Monthly nth weekday recurrence

Coverage: monthly BYDAY/BYSETPOS builder.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Open Schedule, select Monthly, then Nth weekday.
  - Expected: Ordinal and weekday controls appear.
  - Observed:
- Select Last Friday.
  - Expected: Preview dates are the last Friday of each month.
  - Observed:
- Create `Last Friday Ops`.
  - Expected: Materialized occurrences match the preview.
  - Observed:
- Verify the summary text.
  - Expected: The summary is understandable and includes the nth-weekday choice.
  - Observed:

### ROTA-CREATE-07 Time zone and DST behavior

Coverage: rota `tz`, local display, DST-stable recurrence.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Set the test device to a time zone with an upcoming DST transition.
  - Expected: New rota defaults to that device time zone.
  - Observed:
- Create a weekly rota before a DST transition.
  - Expected: Future occurrences keep the same local wall-clock time after DST.
  - Observed:
- View the rota on a second device in a different time zone.
  - Expected: Display uses the rota time zone, not the viewer's local time zone.
  - Observed:
- Look for a time zone picker in the create flow.
  - Expected: If absent, record the gap against the spec's create/edit time zone
  requirement.
  - Observed:

## 4. Rota list, detail, active/upcoming, and occurrences

### ROTA-LIST-01 Shifts list

Coverage: rota list query, roles, metadata.
Personas: User A, User B, User C.
Result: UNTESTED
Issue IDs: []

Steps:

- Open Shifts as User A after creating rotas.
  - Expected: Each rota membership appears with name, description, duration, and
  role badge.
  - Observed:
- Open Shifts as User B after accepting a member invite.
  - Expected: Shared rotas appear with `member` role.
  - Observed:
- Open Shifts as User C after accepting a viewer invite.
  - Expected: Shared rotas appear with `viewer` role.
  - Observed:
- Tap each row.
  - Expected: The correct rota detail opens.
  - Observed:

### ROTA-DETAIL-01 Status card

Coverage: `v_rota_now`, active/upcoming status, boundary timer.
Personas: User A and User B.
Result: UNTESTED
Issue IDs: []

Steps:

- Open a rota with no active occurrence but a future occurrence.
  - Expected: The status card shows `Up next` with assignee and countdown.
  - Observed:
- Open `Near Boundary` before its start time and keep the screen open.
  - Expected: At start time, the card changes to `is on now` without manual
  refresh.
  - Observed:
- Keep the screen open through the end time.
  - Expected: The card changes to the next upcoming occurrence.
  - Observed:
- Background the app across a boundary and foreground it.
  - Expected: The status refreshes correctly.
  - Observed:

### ROTA-DETAIL-02 Upcoming list

Coverage: upcoming occurrence query, 30-day window, active highlight.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Open a rota detail with several upcoming occurrences.
  - Expected: List view shows the next 30 days in ascending order.
  - Observed:
- Confirm each row shows the assigned member and local start/end time.
  - Expected: Names and times match the database.
  - Observed:
- Open an active occurrence.
  - Expected: The active row is highlighted and has an `On now` pill.
  - Observed:
- Tap a future occurrence row.
  - Expected: Occurrence detail opens for that occurrence.
  - Observed:

### ROTA-DETAIL-03 Calendar view

Coverage: calendar display and marked dates.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Toggle the upcoming section from List to Calendar.
  - Expected: Calendar view appears without losing the rota context.
  - Observed:
- Inspect dates with scheduled occurrences.
  - Expected: Each occurrence date is marked.
  - Observed:
- Inspect the active occurrence date.
  - Expected: Active date has the active styling.
  - Observed:
- Toggle back to List.
  - Expected: List view returns with the same data.
  - Observed:

### OCC-01 Occurrence detail states

Coverage: future, active, past, overridden occurrence display.
Personas: User A, User B.
Result: UNTESTED
Issue IDs: []

Steps:

- Open a future occurrence.
  - Expected: The status pill says `Upcoming`, with assignee, start, and end.
  - Observed:
- Open an active occurrence.
  - Expected: The status pill says `On now`.
  - Observed:
- Open a past occurrence.
  - Expected: The status pill says `Ended`; swap request is unavailable.
  - Observed:
- Open an overridden occurrence.
  - Expected: The status pill says `Overridden` and the reason appears if set.
  - Observed:
- Look for "Mark done".
  - Expected: If absent, record the spec gap.
  - Observed:

### OCC-02 Unauthorized occurrence access

Coverage: RLS and protected occurrence detail.
Personas: User D outsider.
Result: UNTESTED
Issue IDs: []

Steps:

- As User D, open a direct link to an occurrence in a rota they do not share.
  - Expected: The app cannot load the occurrence data.
  - Observed:
- As User C viewer, open an occurrence in a rota they can view.
  - Expected: The occurrence is readable but mutation actions are unavailable.
  - Observed:

## 5. Members, roles, invites, and ownership

### MEMBERS-01 Create and accept member invite

Coverage: owner invite link, invite lookup, accept invite RPC.
Personas: User A owner, User B member.
Result: UNTESTED
Issue IDs: []

Steps:

- As User A, tap `+ Invite member`.
  - Expected: Link is copied, an alert appears, and the link remains visible.
  - Observed:
- As authenticated User B, open the link.
  - Expected: The app shows a join screen with rota name and `member` role.
  - Observed:
- Tap "Accept & Join".
  - Expected: User B lands on the rota detail and appears in members.
  - Observed:
- Reopen the same invite.
  - Expected: The invite is invalid, expired, or already used.
  - Observed:

### MEMBERS-02 Create and accept viewer invite

Coverage: viewer role, viewer read-only behavior, viewer assignment exclusion.
Personas: User A owner, User C viewer.
Result: UNTESTED
Issue IDs: []

Steps:

- As User A, tap `+ Viewer`.
  - Expected: A viewer invite link is copied and shown.
  - Observed:
- As User C, accept the invite.
  - Expected: User C lands on the rota detail with viewer role.
  - Observed:
- As User C, inspect members, upcoming list, calendar, and occurrences.
  - Expected: Viewer can read schedule data.
  - Observed:
- As User C, look for invite, reminder edit, role management, swap, override,
and leave actions.
  - Expected: Only read actions and leave are available; privileged mutation
  actions are hidden or blocked.
  - Observed:
- Inspect future occurrences after adding User C.
  - Expected: User C is not assigned round-robin occurrences.
  - Observed:

### MEMBERS-03 Owner role changes

Coverage: promote/demote owner/member/viewer.
Personas: User A owner, User B member, User C viewer.
Result: UNTESTED
Issue IDs: []

Steps:

- As User A, open the action menu for User B.
  - Expected: Role change, transfer ownership, and remove actions are available.
  - Observed:
- Change User B from member to viewer.
  - Expected: Role updates, position changes appropriately, and User B is skipped
  for new assignments.
  - Observed:
- Change User C from viewer to member.
  - Expected: Role updates, User C receives a member position, and future new
  assignments can include User C.
  - Observed:
- Attempt to demote/remove members in ways that would leave the rota with no
members or no owners.
  - Expected: The UI or RPC blocks the action with a clear error.
  - Observed:
- Attempt role changes as non-owner User B.
  - Expected: Controls are hidden or the server rejects the action.
  - Observed:

### MEMBERS-04 Remove member and leave rota

Coverage: remove member, leave rota, membership list refresh.
Personas: User A owner, User B member.
Result: UNTESTED
Issue IDs: []

Steps:

- As User A, remove User B.
  - Expected: Confirmation appears, User B loses access, and lists update for all
  users.
  - Observed:
- Reinvite User B as member.
  - Expected: User B can rejoin through a new invite.
  - Observed:
- As User B, tap "Leave Shift".
  - Expected: Confirmation appears, then User B returns to Shifts and no longer
  sees the rota.
  - Observed:
- As User A, attempt to leave as the sole owner.
  - Expected: The action is blocked unless ownership is transferred or another
  owner exists.
  - Observed:

### MEMBERS-05 Transfer ownership

Coverage: ownership transfer invariant.
Personas: User A owner, User B member.
Result: UNTESTED
Issue IDs: []

Steps:

- As User A, choose "Transfer ownership to User B".
  - Expected: A destructive confirmation appears.
  - Observed:
- Confirm transfer.
  - Expected: User B becomes owner and User A becomes member.
  - Observed:
- As User A, verify owner-only controls are gone.
  - Expected: Invite, member management, reminder edits, and override controls
  are no longer available.
  - Observed:
- As User B, verify owner-only controls are available.
  - Expected: User B can manage members and reminders.
  - Observed:

## 6. Swaps and overrides

### SWAP-01 Request swap

Coverage: assignee-only future swap request, target filtering, message.
Personas: User A owner/member, User B member, User C viewer.
Result: UNTESTED
Issue IDs: []

Steps:

- As the assigned user for a future scheduled occurrence, open occurrence
detail.
  - Expected: "Request swap" is visible.
  - Observed:
- Open the request swap modal.
  - Expected: Eligible targets include owner/member users except self and exclude
  viewers.
  - Observed:
- Enter a message longer than 200 characters.
  - Expected: The message is capped at 200 characters.
  - Observed:
- Select User B and send.
  - Expected: Modal closes, occurrence shows a pending swap banner, and no second
  swap can be requested while pending.
  - Observed:
- As a non-assignee, active assignee, or past assignee, open occurrence detail.
  - Expected: "Request swap" is hidden or blocked.
  - Observed:

### SWAP-02 Target accepts swap

Coverage: target inbox, accept RPC, reassignment, realtime.
Personas: User A requester, User B target.
Result: UNTESTED
Issue IDs: []

Steps:

- As User B, open Home after User A sends a swap request.
  - Expected: A "Swap requests for you" card appears.
  - Observed:
- Tap the card.
  - Expected: Occurrence detail opens with requester, target, and message.
  - Observed:
- Tap Accept.
  - Expected: Occurrence assigned user changes to User B, swap status is no
  longer pending, and inbox card disappears.
  - Observed:
- Watch User A's device during acceptance.
  - Expected: Occurrence detail, rota detail, and Home update via realtime or
  invalidation without restart.
  - Observed:
- Inspect notification jobs for the occurrence.
  - Expected: Old assignee jobs are cancelled and new assignee jobs are inserted.
  - Observed:

### SWAP-03 Target declines swap

Coverage: decline RPC and state cleanup.
Personas: User A requester, User B target.
Result: UNTESTED
Issue IDs: []

Steps:

- Create a new pending swap request.
  - Expected: Target sees a pending request.
  - Observed:
- As User B, tap Decline.
  - Expected: Occurrence remains assigned to User A and the pending banner/inbox
  clear.
  - Observed:
- As User A, verify a new swap request can be created after decline.
  - Expected: Request action is available again for future scheduled occurrence.
  - Observed:

### SWAP-04 Requester cancels swap

Coverage: cancel RPC and pending state cleanup.
Personas: User A requester, User B target.
Result: UNTESTED
Issue IDs: []

Steps:

- Create a pending swap request as User A.
  - Expected: Occurrence shows the pending banner.
  - Observed:
- As User A, tap Cancel in the pending banner and confirm.
  - Expected: Swap status becomes cancelled and the pending banner disappears.
  - Observed:
- As User B, check Home.
  - Expected: The inbox card disappears.
  - Observed:

### OVERRIDE-01 Owner override

Coverage: owner-only override, target filtering, reason, notification reconcile.
Personas: User A owner, User B member, User C viewer.
Result: UNTESTED
Issue IDs: []

Steps:

- As User A, open a future occurrence and tap "Override assignment".
  - Expected: Override modal opens.
  - Observed:
- Inspect the assignee list.
  - Expected: Owners and members appear; viewers do not.
  - Observed:
- Select User B, enter a reason, and save.
  - Expected: Occurrence assignee changes to User B, status displays
  `Overridden`, and the reason appears.
  - Observed:
- As User B, check Home and rota detail.
  - Expected: The reassigned occurrence appears as User B's upcoming shift.
  - Observed:
- Inspect notification jobs for the occurrence.
  - Expected: Jobs are reconciled to the new assignee.
  - Observed:

### OVERRIDE-02 Override permissions

Coverage: non-owner and viewer restrictions.
Personas: User B member, User C viewer.
Result: UNTESTED
Issue IDs: []

Steps:

- As User B, open an occurrence in a rota where User B is not owner.
  - Expected: "Override assignment" is hidden.
  - Observed:
- As User C viewer, open an occurrence.
  - Expected: Override controls are hidden.
  - Observed:
- Attempt override through any direct API/debug path as User B or User C.
  - Expected: RPC rejects the action.
  - Observed:

## 7. Reminders and push notifications

### REMINDER-01 Reminder list and owner controls

Coverage: rota reminders UI and owner-only mutation.
Personas: User A owner, User B member, User C viewer.
Result: UNTESTED
Issue IDs: []

Steps:

- As User A, open a rota detail with no reminders.
  - Expected: Reminders section shows "No reminders set" and `+ Add reminder`.
  - Observed:
- Add presets for 15 minutes, 1 hour, 4 hours, 1 day, and 1 week.
  - Expected: Each appears once in sorted order.
  - Observed:
- Try to add a duplicate preset.
  - Expected: Duplicate options are not offered or are rejected.
  - Observed:
- Remove a reminder.
  - Expected: Confirmation appears and the reminder disappears.
  - Observed:
- As User B and User C, inspect the same section.
  - Expected: Existing reminders are visible, but add/remove controls are hidden
  or server-rejected.
  - Observed:

### REMINDER-02 Custom reminder

Coverage: custom lead times and platform behavior.
Personas: User A owner.
Result: UNTESTED
Issue IDs: []

Steps:

- On iOS, choose "Custom (enter minutes)".
  - Expected: A prompt accepts a positive integer and adds the reminder.
  - Observed:
- On Android, choose "Custom (enter minutes)".
  - Expected: The app provides a supported input path; if not, record the
  platform-specific failure.
  - Observed:
- Enter negative minutes.
  - Expected: The app rejects the value.
  - Observed:
- Enter zero minutes.
  - Expected: The app either accepts "At time of turn" intentionally or rejects
  it consistently with the copy.
  - Observed:
- Enter non-numeric text.
  - Expected: The app rejects the value.
  - Observed:

### REMINDER-03 Push token registration

Coverage: device permission, Expo token, `push_tokens`.
Personas: User A on physical iOS and Android.
Result: UNTESTED
Issue IDs: []

Steps:

- Fresh install and sign in on a physical device.
  - Expected: The app requests notification permission.
  - Observed:
- Grant permission.
  - Expected: A valid `ExponentPushToken[...]` row appears in `push_tokens` with
  platform and `last_seen_at`.
  - Observed:
- Deny permission on a fresh install.
  - Expected: No token row is written and Settings reflects the denied state.
  - Observed:
- Relaunch after granting permission.
  - Expected: Token registration is idempotent and updates `last_seen_at`.
  - Observed:

### REMINDER-04 Notification job reconciliation

Coverage: `notification_jobs`, reconcile RPCs, materialization, reassignment.
Personas: User A owner, User B member.
Result: UNTESTED
Issue IDs: []

Steps:

- Add a reminder to `Reminder Check`.
  - Expected: Pending notification jobs are created for eligible future
  occurrences and assignees.
  - Observed:
- Add a second reminder.
  - Expected: Additional jobs are created without duplicating existing keys.
  - Observed:
- Delete a reminder.
  - Expected: Pending jobs for that reminder are cancelled or removed according
  to the migration behavior.
  - Observed:
- Accept a swap or override a future occurrence.
  - Expected: Old assignee pending jobs are cancelled and new assignee jobs are
  inserted.
  - Observed:
- Confirm viewers do not receive per-occurrence reminder jobs.
  - Expected: No jobs are created for viewer-only users.
  - Observed:

### REMINDER-05 Dispatch and notification tap

Coverage: dispatch edge function, Expo push delivery, notification deep link.
Personas: User A or User B assigned to a near-future occurrence.
Result: UNTESTED
Issue IDs: []

Steps:

- Create an occurrence with a reminder that fires soon.
  - Expected: A pending job has `fire_at <= now()` at the expected time.
  - Observed:
- Wait for cron or manually invoke `dispatch-notifications` in the test
environment.
  - Expected: Job status changes to `sent` or `failed` with no duplicate sends.
  - Observed:
- Receive the push on the device.
  - Expected: Title is the rota name and body describes the assignee timing.
  - Observed:
- Tap the notification while the app is foregrounded or backgrounded.
  - Expected: The app opens the matching occurrence detail.
  - Observed:
- Tap the notification from a cold start.
  - Expected: After authentication is available, the app opens the matching
  occurrence detail.
  - Observed:

## 8. Home screen behavior

### HOME-01 User's shifts

Coverage: Home shift cards, active/upcoming own assignments.
Personas: User A and User B.
Result: UNTESTED
Issue IDs: []

Steps:

- Open Home as User A with no assigned future occurrences.
  - Expected: Empty state appears.
  - Observed:
- Open Home as User A with an active assigned occurrence.
  - Expected: The card appears first and shows `On now`, end time, and time left.
  - Observed:
- Open Home as User A with future assigned occurrences.
  - Expected: Cards are sorted by active first, then soonest start/end boundary.
  - Observed:
- Tap a Home shift card.
  - Expected: Rota detail opens for that rota.
  - Observed:
- Open Home as a viewer with rotas but no assignments.
  - Expected: If Home is intended to show every rota, viewer sees rota status;
  if Home is intended to show only own shifts, empty state is acceptable and
  the spec gap is recorded.
  - Observed:

### HOME-02 Swap inbox

Coverage: pending swap inbox cards.
Personas: User B target.
Result: UNTESTED
Issue IDs: []

Steps:

- Create a pending swap targeted to User B.
  - Expected: Home displays "Swap requests for you".
  - Observed:
- Confirm card content.
  - Expected: Card shows rota name, requester, occurrence time, and optional
  message.
  - Observed:
- Tap the card.
  - Expected: Occurrence detail opens.
  - Observed:
- Accept, decline, or cancel the swap.
  - Expected: The card disappears.
  - Observed:

## 9. Offline cache and realtime

### OFFLINE-01 Cached read behavior

Coverage: TanStack Query persister, offline banner, read-only offline.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- While online, open Home, Shifts, a rota detail, and an occurrence detail.
  - Expected: Data loads and is cached where configured.
  - Observed:
- Enable airplane mode or disable network.
  - Expected: Offline banner appears.
  - Observed:
- Reopen Shifts and the previously viewed rota detail.
  - Expected: Cached rotas, rota-now, and occurrences remain readable.
  - Observed:
- Reopen Home.
  - Expected: If Home data is not persisted, record the gap; otherwise cached own
  shifts appear.
  - Observed:
- Try a mutation while offline, such as create rota, add reminder, or request
swap.
  - Expected: Mutation fails clearly and does not claim success; no offline queue
  is expected in v1.
  - Observed:

### OFFLINE-02 Recovery after offline mutation failure

Coverage: retry after network restoration.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Attempt a mutation while offline and observe the failure.
  - Expected: The UI remains usable.
  - Observed:
- Restore network.
  - Expected: Offline banner disappears.
  - Observed:
- Retry the same mutation.
  - Expected: Mutation succeeds exactly once.
  - Observed:

### REALTIME-01 Membership updates across devices

Coverage: `rota_members` subscriptions and query invalidation.
Personas: User A on device 1, User B on device 2.
Result: UNTESTED
Issue IDs: []

Steps:

- Open the same rota detail on both devices.
  - Expected: Both devices show the same members.
  - Observed:
- As User A, change User B's role.
  - Expected: User B's device updates role and controls without relaunch.
  - Observed:
- As User A, remove User B.
  - Expected: User B loses access and their list/detail updates.
  - Observed:

### REALTIME-02 Occurrence and swap updates across devices

Coverage: `occurrences` and `swap_requests` subscriptions.
Personas: User A and User B.
Result: UNTESTED
Issue IDs: []

Steps:

- Open an occurrence detail on both devices.
  - Expected: Both devices show the same assignee and status.
  - Observed:
- Request a swap on one device.
  - Expected: Pending banner appears on both relevant devices.
  - Observed:
- Accept or decline on the target device.
  - Expected: Requester device updates without relaunch.
  - Observed:
- Override the same occurrence as owner.
  - Expected: All open screens refresh assignee/status.
  - Observed:

## 10. Security and access control

### SECURITY-01 Non-member read isolation

Coverage: RLS for rotas, members, occurrences, reminders, swaps.
Personas: User D outsider.
Result: UNTESTED
Issue IDs: []

Steps:

- As User D, open direct links to User A's rota and occurrence.
  - Expected: Data does not load.
  - Observed:
- As User D, attempt to accept a consumed or expired invite code.
  - Expected: The app shows invalid invite.
  - Observed:
- As User D, attempt direct API calls for `request_swap`, `override_occurrence`,
`add_rota_reminder`, and `change_member_role` if test tooling is available.
  - Expected: RPCs reject the action.
  - Observed:

### SECURITY-02 Viewer write isolation

Coverage: viewer read-only role.
Personas: User C viewer.
Result: UNTESTED
Issue IDs: []

Steps:

- As User C, inspect all visible screens for a shared rota.
  - Expected: No write controls are available except leaving the rota.
  - Observed:
- Attempt direct API calls to request a swap, become a target, override, add
reminder, or manage members if test tooling is available.
  - Expected: RPCs reject the action.
  - Observed:
- Inspect generated occurrences after viewer joins.
  - Expected: Viewer is not assigned and has no reminder jobs.
  - Observed:

### SECURITY-03 Owner/member invariants

Coverage: at least one owner, at least one member, creator removal rules.
Personas: User A owner, User B member.
Result: UNTESTED
Issue IDs: []

Steps:

- Attempt to remove or demote the only owner.
  - Expected: The action is blocked.
  - Observed:
- Attempt to remove or demote the only non-viewer member.
  - Expected: The action is blocked.
  - Observed:
- Attempt to remove the original creator before ownership transfer.
  - Expected: The action is blocked if the invariant is implemented.
  - Observed:
- Transfer ownership and then remove the former owner.
  - Expected: The action follows the documented ownership rules.
  - Observed:

## 11. Accessibility, usability, and platform polish

### A11Y-01 VoiceOver and TalkBack basics

Coverage: accessibility labels, button roles, readable controls.
Personas: any authenticated user.
Result: UNTESTED
Issue IDs: []

Steps:

- Enable VoiceOver on iOS and navigate Sign In, Home, Shifts, Rota Detail,
Occurrence Detail, and Settings.
  - Expected: Main actions have useful labels and button roles.
  - Observed:
- Enable TalkBack on Android and repeat the same flow.
  - Expected: Main actions have useful labels and button roles.
  - Observed:
- Navigate modals with screen reader enabled.
  - Expected: Schedule, swap, and override modals are understandable and
  dismissible.
  - Observed:

### A11Y-02 Dynamic type and layout

Coverage: large text, small screens, keyboard avoidance.
Personas: any authenticated user.
Result: UNTESTED
Issue IDs: []

Steps:

- Increase OS text size.
  - Expected: Text remains readable and primary actions remain reachable.
  - Observed:
- Test on a small phone size.
  - Expected: Forms, modals, and bottom buttons remain usable.
  - Observed:
- Fill text inputs with the keyboard open.
  - Expected: Keyboard does not permanently cover required fields or submit
  buttons.
  - Observed:
- Rotate the device if rotation is possible.
  - Expected: The app remains portrait or handles rotation according to config.
  - Observed:

### PLATFORM-01 iOS and Android parity

Coverage: platform-specific action sheets, alerts, prompts, permissions.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Test member management action menu on iOS.
  - Expected: Native action sheet works.
  - Observed:
- Test member management action menu on Android.
  - Expected: Alert action list works.
  - Observed:
- Test custom reminder on iOS and Android.
  - Expected: Both platforms have a functional input path.
  - Observed:
- Test deep links on iOS and Android.
  - Expected: `rotini://invite/{code}` and notification occurrence links open the
  correct screens.
  - Observed:

### POLISH-01 Copy and consistency

Coverage: user-facing language and consistency.
Personas: any.
Result: UNTESTED
Issue IDs: []

Steps:

- Scan the app for mixed "rota" and "shift" terminology.
  - Expected: Product copy is consistent or intentionally clarified.
  - Observed:
- Scan destructive confirmations.
  - Expected: Remove, leave, transfer, cancel swap, and override actions are clear
  and hard to trigger accidentally.
  - Observed:
- Scan empty states.
  - Expected: Empty states explain what to do next.
  - Observed:
- Scan error alerts.
  - Expected: Error copy is specific enough for a tester or user to recover.
  - Observed:

## 12. Release smoke checks

### RELEASE-01 Production-like build startup

Coverage: build config, Sentry init, app startup.
Personas: User A.
Result: UNTESTED
Issue IDs: []

Steps:

- Install a preview or production-like EAS build.
  - Expected: App starts without Metro/dev-client dependencies.
  - Observed:
- Confirm required `EXPO_PUBLIC_*` values are present.
  - Expected: Auth, Supabase, Sentry, and push token registration work according
  to the profile.
  - Observed:
- Trigger a controlled non-fatal test error if a test hook exists.
  - Expected: Sentry receives the event with release, dist, environment, and user
  context when configured.
  - Observed:

### RELEASE-02 Database scheduled jobs

Coverage: daily top-up, materialization cron, notification cron.
Personas: admin tester.
Result: UNTESTED
Issue IDs: []

Steps:

- Inspect cron job registration in Supabase.
  - Expected: Daily top-up and notification dispatch jobs are scheduled.
  - Observed:
- Manually invoke or wait for daily top-up in a test project.
  - Expected: Active rotas maintain at least 30 days of future occurrences.
  - Observed:
- Manually invoke or wait for notification dispatch.
  - Expected: Due jobs are claimed and marked sent or failed.
  - Observed:
- Confirm Edge Function logs contain no recurring authorization, Vault, or
URL errors.
  - Expected: No repeated failures.
  - Observed:

## Completion checklist

- Every `Result: UNTESTED` has been changed to `PASS`, `FAIL`, or `BLOCKED`.
- Every failed or blocked test references at least one `ISSUE-###`.
- Every `ISSUE-###` has severity, environment, expected, actual, and repro
steps.
- Screenshots, logs, SQL rows, or videos are attached for S1 and S2 issues.
- Known spec gaps are separated from regressions.
- The final run notes identify the highest-risk areas for the next agent.

