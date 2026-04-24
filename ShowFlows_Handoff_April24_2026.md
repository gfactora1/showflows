# ShowFlows — Engineering Copilot Handoff Prompt
*Last updated: April 24, 2026*

---

## Role

You are the engineering copilot for **ShowFlows**, a mobile-first SaaS PWA for bands and live production teams. You are picking up from a prior session. Read everything below carefully before doing anything.

---

## Stack

- **Next.js 16.1.6** (App Router, TypeScript)
- **Supabase** (Postgres, Auth, RLS, RPCs)
- **React 19**, Tailwind CSS (conflict UI only), inline styles everywhere else
- **Resend** for email (custom domain `showflows.net` already verified and working)
- **Stripe** for billing (sandbox fully configured and tested, live not yet activated)
- **Vercel** (target deployment — not yet deployed)

---

## Repo & Workflow

- Local: `C:\Users\gfact\showflows`
- GitHub: `https://github.com/gfactora1/showflows.git` (branch: `main`)
- User works in **VS Code with PowerShell terminal**
- Always provide **complete replacement files**, never partial edits
- For large files, deliver as downloadable artifacts to avoid paste truncation
- Remind user to sync GitHub at natural checkpoints

### Git Workflow (PowerShell)
```powershell
git add .
git commit -m "your message here"
git push
```
Use semicolons `;` to chain commands, not `&&`

### Stripe CLI PATH Fix
The Stripe CLI is at `C:\Program Files\Stripe\stripe.exe`. Run this in any new terminal before using stripe commands:
```powershell
$env:PATH += ";C:\Program Files\Stripe"
```

---

## Supabase

- Project dashboard: `https://supabase.com/dashboard/project/vvitfaoiqwovyssygmkt`
- SQL Editor is used for all schema changes — user pastes results back into chat
- No assumed Supabase knowledge — always explain steps clearly and step by step

---

## Environment Variables (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://vvitfaoiqwovyssygmkt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=ShowFlows <invites@showflows.net>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51TOoMSFr4eum1n734iy2yvG6Ho07psUpfdjIWO0lBB8NTWiTwNrNmEWazHVyi705QtBVFkfPltzXAX3FPVvbL8Fm00nCOSLKFi
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PRICE_ID_PRO_ANNUAL=price_1TOobTFr4eum1n73vYFCDtvw
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Stripe Business Details

- Legal entity: **Long Island Technology Services Inc.** (S-Corp)
- DBA used in Stripe: **LIT Entertainment Group**
- Customer-facing brand: **ShowFlows**
- Domain: `showflows.net` (registered via Squarespace)
- Stripe account ID: `acct_1TOoMSFr4eum1n73`
- Product: ShowFlows Pro — $150/year, 14-day free trial, no upfront card
- Price ID: `price_1TOobTFr4eum1n73vYFCDtvw`

---

## Dev Testing

```powershell
npm run dev  →  http://localhost:3000
```

To set a project to Pro for testing (run in browser console while logged in):
```javascript
fetch('/api/projects/PROJECT_ID/dev/billing', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: 'pro', status: 'active' })
}).then(r => r.json()).then(console.log)
```

To run Stripe webhook listener locally (requires two terminals — one for dev server, one for stripe):
```powershell
$env:PATH += ";C:\Program Files\Stripe"
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

To resend a Stripe event for testing:
```powershell
$env:PATH += ";C:\Program Files\Stripe"
stripe events resend evt_XXXXXXX
```

---

## What Has Been Built (All Working and Tested)

### Database Tables (Supabase, all with RLS)
`projects`, `project_members`, `project_billing`, `project_invites`, `people`, `roles`, `providers`, `venues`, `venue_contacts`, `shows`, `show_assignments`, `show_requirements`, `show_risk_scores`, `project_required_roles`, `project_default_roster`, `computed_conflicts`, `conflict_compute_runs`, `member_unavailability`

> Note: Old `invites` table still exists but is dead — safe to drop (on backlog)

### Key Schema Notes
- `shows` has `venue_id uuid` (references venues) and `provider_id uuid` (references providers) — old venue/city text columns were dropped
- `venues` has `created_by_user_id` for cross-project library
- `project_default_roster` stores person+role pairs that auto-seed new shows
- `people` are project-scoped; cross-project identity uses normalized email for MVP
- `member_unavailability` columns: `id`, `auth_user_id`, `people_id`, `created_by_project_id`, `created_by_user_id`, `start_date`, `end_date`, `start_time`, `end_time`, `note`, `created_at`, `updated_at`

### Database Functions (all exist and work)
`is_project_member`, `is_project_owner`, `is_project_editor`, `is_project_admin`, `is_project_pro`, `get_project_entitlement`, `compute_conflicts_pro`, `compute_conflicts_admin`, `accept_project_invite`, `seed_project_owner_membership`, `start_project_pro_trial`, `transfer_project_ownership`, `set_updated_at`

### `compute_conflicts_pro` — Conflict Types Detected
- **A)** Within-project person double-booking → severity 3 (Critical)
- **B)** Cross-project double-booking via normalized email → severity 3 (Critical)
- **C)** Missing required roles → severity 2 (Warning)
- **D)** Missing sound provider → severity 1 (Info)
- **E)** Member unavailability conflicts → severity 3 if full day or time overlap, severity 2 if same day no time overlap

### Supabase Client Files
- `lib/supabaseClient.ts` — browser client (`createBrowserClient`)
- `lib/supabaseSSR.ts` — SSR server client (`createServerClient` with cookies) — use in ALL route handlers
- `lib/supabaseServer.ts` — service role client — used ONLY in `app/api/invites/lookup/route.ts` and `app/api/projects/[projectId]/dev/billing/route.ts`
- `lib/stripe.ts` — Stripe singleton (`apiVersion: '2025-03-31.basil'`)

### UI Components (all in `app/components/`)
- `Projects.tsx` — project list + create, loads myRole per project
- `ProjectDetail.tsx` — tabbed layout with admin/member view toggle. Admin tabs: Shows | Venues | Default Roster | People | Roles | Providers | 🎵 Songs | 📅 Availability | ⚡ Conflicts | Members. Member tabs: Shows | 📅 Availability. Fetches billing status, shows Upgrade to Pro or Manage Subscription based on Pro status.
- `Shows.tsx` — show list with venue picker + sound provider picker, upcoming/past split
- `ShowDetail.tsx` — show detail with lineup table, auto-seeds from default roster
- `DefaultRoster.tsx` — project-level default person+role assignments
- `People.tsx` — roster management, active/inactive. Has 📅 Availability button per person (visible to owners AND editors). Opens UnavailabilityModal.
- `Roles.tsx` — role management with sort_order, active/inactive
- `Providers.tsx` — provider management with provider_type
- `Venues.tsx` — venue management with global library
- `ProjectMembers.tsx` — member list, invite flow, pending invites
- `UnavailabilityModal.tsx` — modal for admin/editor to manage unavailability blocks per person. Fires notify-availability-conflict route on save.
- `AvailabilityCalendar.tsx` — admin calendar view showing ALL shows and ALL member blocks for a project. Has encoding issues (â€¹ etc.) — not yet fixed.
- `MemberShowsView.tsx` — member view of their assigned shows with confirm attendance button
- `MemberAvailability.tsx` — NEW: member self-service availability calendar. Matches logged-in user to people record by email. Shows their shows + their own blocks on a calendar. Lets them add/remove their own blocks. Highlights conflicts. Fires notification route on save.
- `SongLibrary.tsx` — exists but not reviewed this session

### API Routes
- `app/api/invites/create/route.ts` — creates invite, sends branded HTML email from `invites@showflows.net`
- `app/api/invites/lookup/route.ts` — service role lookup by token
- `app/api/invites/accept/route.ts` — calls accept_project_invite RPC
- `app/api/projects/[projectId]/compute-conflicts/route.ts` — calls compute_conflicts_pro RPC
- `app/api/projects/[projectId]/computed-conflicts-enriched/route.ts` — fetches enriched conflict results
- `app/api/projects/[projectId]/billing-status/route.ts` — returns `{ isPro: boolean }`
- `app/api/projects/[projectId]/dev/billing/route.ts` — dev-only Pro toggle, blocked in production
- `app/api/projects/[projectId]/notify-availability-conflict/route.ts` — fires when unavailability block added; checks for show conflicts and emails owner + member. Encoding fixed.
- `app/api/projects/[projectId]/notify-assignment-conflict/route.ts` — fires when person assigned to show; checks for unavailability conflicts and emails owner + member. Encoding fixed.
- `app/api/stripe/checkout/route.ts` — creates Stripe checkout session (owner only, passes projectId in metadata)
- `app/api/stripe/webhook/route.ts` — handles `checkout.session.completed` (upserts project_billing to pro) and `customer.subscription.deleted` (downgrades to free)
- `app/api/stripe/portal/route.ts` — creates Stripe customer portal session
- `app/api/email/test/route.ts` — Resend test endpoint (still uses sandbox from address — dev only)

### Pages
- `app/projects/[projectId]/conflicts/page.tsx` — server page for conflict intelligence
- `app/projects/[projectId]/conflicts/ui/ConflictResultsPage.enriched.tsx` — main conflict UI (uses Tailwind)
- `app/projects/[projectId]/conflicts/ui/components/` — ConflictCard, ConflictGroupList, ConflictSummary, ComputeConflictsButton, ConflictRangePicker
- `app/projects/[projectId]/upgrade/page.tsx` — success and canceled states after Stripe checkout
- `app/invite/[token]/page.tsx` — invite acceptance page

### Lib Files
- `lib/conflicts/conflictReadModel.ts`
- `lib/conflicts/conflictReadModel.enriched.ts`
- `lib/stripe.ts`

---

## Stripe Integration (Fully Working in Sandbox)

Full end-to-end flow tested and verified:
1. Owner clicks ⚡ Upgrade to Pro in Conflicts tab
2. Redirects to Stripe hosted checkout (14-day trial, $150/year)
3. Payment completes → webhook fires → `project_billing` upserted to pro/active with Stripe customer and subscription IDs
4. Owner sees Manage Subscription button instead of Upgrade button
5. Manage Subscription → Stripe customer portal (cancel, update payment, view invoices)

`project_billing` table has: `project_id`, `billing_owner_user_id`, `plan`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_start`, `current_period_end`, `created_at`, `updated_at`

---

## Member Unavailability Feature (Fully Working)

### Admin/Editor flow
- In People tab, each person has a 📅 Availability button
- Opens UnavailabilityModal — add blocks with start/end date, optional time range, note
- Full day is default; uncheck for time-specific blocks
- On save, fires notify-availability-conflict route in background
- Owners can delete any block; editors can delete blocks they created

### Member self-service flow
- In member view (📅 Availability tab), MemberAvailability component loads
- Matches logged-in user to people record via email (ilike match)
- If no match found, shows friendly message asking them to contact owner
- Calendar shows their shows (purple) and their blocks (yellow); conflicts shown in red
- Click any date to see show + block detail inline
- "+ Mark myself unavailable" button opens inline form
- Members can remove their own blocks
- On save, fires notification route

### RLS on member_unavailability
- Members can insert/view/delete their own blocks (via auth_user_id)
- Owners can insert/view/delete any block in their project
- Editors can insert blocks and delete blocks they created
- All project members can view all blocks (for calendar display)

### Conflict engine integration
- `compute_conflicts_pro` section E detects member_unavailability conflicts
- Full day block on show date → severity 3 (Critical)
- Time block overlapping show time → severity 3 (Critical)
- Same day block, no time overlap → severity 2 (Warning)

---

## RLS Policies Summary
- Owners can do everything including delete
- Editors can insert and update but not delete (except their own unavailability blocks)
- Members/readonly can only select
- Pro-gated tables (`computed_conflicts`, `conflict_compute_runs`, `show_risk_scores`) require `is_project_pro()`
- `venue_contacts` is owner-only
- `project_default_roster` follows editor/owner write, owner delete

---

## Product Philosophy

See `PRODUCT.md` in repo root. Core rule:
- **Free** = operational management (plan and run shows)
- **Pro** = conflict intelligence (catch problems before they happen)

### Free Tier Limits (planned, not yet enforced in code)
- 1 project maximum — adding more requires Pro
- Possible show cap per year (number TBD — not yet decided)

### Pro Features Active
- Conflict Intelligence (double-booking, missing roles, missing provider, unavailability)
- Customer portal (manage/cancel subscription)

---

## Important Conventions
- Always deliver **complete replacement files**, never partial edits
- Use **inline styles**, not Tailwind, for new components (conflict UI is the exception)
- Never use service role in user-facing routes except the two noted above
- Always use `supabaseSSR()` in route handlers
- User has **no prior Supabase experience** — explain database steps clearly
- Run SQL in Supabase SQL Editor — user pastes results back
- User works on **Windows with PowerShell**
- User works in **VS Code**

---

## Known Issues / Tech Debt
- `AvailabilityCalendar.tsx` (admin calendar) has UTF-8 encoding issues (`â€¹`, `â€º`, `ðŸ"`, `â€¦`) — not yet fixed
- `auth_user_id` on `member_unavailability` is null for all admin-created blocks — only populated when member creates their own block via MemberAvailability component
- `created_by_project_id` on `member_unavailability` is always null — unused column
- Old `invites` table still exists — safe to drop
- `show_risk_scores` table exists but not implemented
- `SongLibrary.tsx` exists but was not reviewed this session

---

## Remaining Backlog (in priority order)

1. **Vercel production deployment** ← **START HERE**
   - Connect GitHub repo to Vercel
   - Add all env vars to Vercel dashboard
   - Configure custom domain `showflows.net` in Vercel
   - Update DNS in Squarespace to point to Vercel
   - Update `NEXT_PUBLIC_APP_URL` to `https://showflows.net`
   - Set up production Stripe webhook endpoint (different from local)
   - Update Supabase auth redirect URLs for production domain

2. **Free tier enforcement**
   - Block creating more than 1 project on Free at API level (check in createProject)
   - Show count cap per year (number TBD)
   - Friendly upgrade prompt when limit hit

3. **Unconfirm/cancel attendance**
   - Owners can reverse confirmed status from admin lineup table
   - Members can reverse their own confirmed status from MemberShowsView show card

4. **User onboarding/profile flow**
   - Ask for display name during signup
   - Store in auth `user_metadata` as `full_name`
   - Use in invite emails ("Gary has invited you") and personalization

5. **Admin/member view toggle improvements** (if needed)
   - Currently owners/editors can toggle to member view
   - Consider whether readonly members see the toggle

6. **Fix AvailabilityCalendar.tsx encoding issues**
   - Replace garbled characters with proper Unicode escapes or HTML entities

7. **Drop old `invites` table**
   - Dead table, nothing uses it, safe to drop

8. **Conflict card detail display**
   - Cross-project conflicts show raw JSON in Details panel
   - Make human-readable

9. **`show_risk_scores`**
   - Table exists, not yet implemented

10. **Membership identity linking**
    - Link `people` record to `auth.uid()` when invited user accepts
    - Post-MVP

11. **Stripe go-live**
    - Switch from sandbox to live keys
    - Activate Stripe account with real business/bank details
    - Set up production webhook endpoint in Stripe dashboard

12. **Setlists / show-day mode**
    - Free tier feature, not yet built

---

## Where We Left Off

Member unavailability self-service feature is complete and tested. GitHub should be synced. **Next task is Vercel production deployment.**

### What was completed this session (in order)
1. Stripe account created (LIT Entertainment Group sandbox)
2. ShowFlows Pro product created ($150/year, 14-day trial)
3. Stripe SDK installed (`stripe`, `@stripe/stripe-js`)
4. `lib/stripe.ts` created
5. `app/api/stripe/checkout/route.ts` created
6. `app/api/stripe/webhook/route.ts` created and debugged (fixed 404 from wrong folder, fixed 500 from invalid period dates)
7. `app/projects/[projectId]/upgrade/page.tsx` created
8. `app/components/ProjectDetail.tsx` updated — Upgrade to Pro button, billing status fetch, Manage Subscription button
9. `app/api/projects/[projectId]/billing-status/route.ts` created
10. Stripe customer portal configured and `app/api/stripe/portal/route.ts` created
11. Full end-to-end Stripe test completed — checkout → webhook → project_billing → portal all working
12. Confirmed invite email is already complete (was done in prior session)
13. Confirmed email deliverability already done (`showflows.net` verified in Resend)
14. Member unavailability feature reviewed — table, RLS, UnavailabilityModal, AvailabilityCalendar all pre-existing
15. Added editor RLS policies to `member_unavailability`
16. Fixed `canManageAvailability` in `People.tsx` to include editors
17. Fixed UTF-8 encoding in both notification route files
18. Built `app/components/MemberAvailability.tsx` — member self-service calendar
19. Wired MemberAvailability into ProjectDetail member view availability tab
20. Tested end-to-end — calendar, day detail, add block, conflict detection all working
