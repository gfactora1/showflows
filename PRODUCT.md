# ShowFlows — Product Philosophy & Tiering

## Core Principle

**Free is a real product, not a crippled demo. Pro is where the app becomes operationally intelligent.**

We do not lock basic show management behind a paywall. Users should be able to create and run projects on the Free tier and feel that ShowFlows is already valuable. The upgrade becomes compelling when they want smarter analysis, conflict detection, and operational insight.

---

## Free Tier — Core Operational Workflow

The Free tier includes the core planning and execution features a band or project needs to actually use ShowFlows day to day.

Free tier users can:

- Create and manage projects
- Invite members and collaborators
- Manage project membership and roles
- Create and edit shows
- Store basic show details — date, time, venue, notes, logistics
- Manage people and roster entries
- Define roles
- Assign people to shows and roles
- Manage providers (e.g. sound providers)
- Use setlists, notes, and show-day operational information
- Use the app as the main system for organizing a band's live workflow

**Free should let a user actually run a band or live project inside the app.** It should feel generous and complete enough that using ShowFlows is worthwhile even before paying.

---

## Pro Tier — Intelligence and Advanced Operational Protection

The Pro tier unlocks the intelligence layer. This is the premium differentiator.

**Pro is not mainly about more CRUD. It is about smarter analysis and protection against mistakes.**

### MVP Pro Features — Conflict Intelligence

- Cross-show double-booking detection (within a project)
- Cross-project double-booking detection (email-based identity matching for MVP; auth-linked identity long term)
- Missing required role detection
- Missing sound provider detection
- Conflict computation and enriched conflict views
- Premium analysis screens and summaries that surface problems the user might otherwise miss

### The Key Product Rule

> Free lets users plan and manage shows. Pro helps users avoid mistakes and make better decisions.

---

## Why This Split Matters

We want the Free tier to feel strong because that builds trust and adoption. A band should be able to onboard, enter shows, assign people, and feel that the app is already useful. Then, once they rely on it, Pro becomes the obvious upgrade because it adds protection and intelligence.

**The upgrade message is not:**
> "Pay us to unlock the basics."

**The upgrade message is:**
> "You can already run your band here. Upgrade if you want ShowFlows to actively catch problems for you."

---

## Longer-Term Pro Direction

Beyond MVP, Pro can expand further into intelligence features such as:

- Richer conflict analysis
- Readiness scoring per show
- Transition risk detection between back-to-back shows
- Crew load and fatigue warnings
- Substitution suggestions when someone is unavailable
- Higher-level dashboards and predictive insights
- Calendar sync and personal availability / blackout dates

For MVP, the core distinction stays simple:

| Tier | What it does |
|------|-------------|
| Free | Operational management — plan and run shows |
| Pro  | Conflict intelligence and advanced insight — catch problems before they happen |

---

## Identity Model Notes

### Current (MVP)
- People are project-scoped (`people.project_id`)
- Within-project double-booking: matched on `person_id`
- Cross-project double-booking: matched on normalized email (`lower(trim(email))`)
- Email matching is an MVP identity bridge only

### Long Term
- Move to auth-linked identity
- When an invited user accepts and logs in, their `people` record should be linked to `auth.uid()`
- Cross-project conflict detection should then use `auth_user_id` as the canonical identity
- Email matching should be deprecated as the primary identity mechanism once auth linking is in place

---

## Pricing Direction (discussed, not finalized)

- Annual-first pricing — aligns to band budgeting cadence
- Target: approximately $150/year per project or band
- 14-day Pro trial without upfront payment method (reduces signup friction)
- Revert to Free after trial if not converted
- Stripe integration is the next billing milestone

---

## Technical Enforcement

Pro gating is enforced at the database level via:

- `is_project_pro(project_id)` — checks `project_billing` for active plan + valid period
- `compute_conflicts_pro()` — SECURITY DEFINER function that checks entitlement before computing
- RLS policies on `computed_conflicts` and `conflict_compute_runs` — require Pro to read results

Pro is **not** enforced only in the frontend. All gating flows through DB-level checks so it cannot be bypassed by API calls.

---

*Last updated: April 2026*
*This document should be kept current as the product evolves.*
