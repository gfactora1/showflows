// ShowFlows Design System Tokens
// Single source of truth — import from any component

export const colors = {
  // ── Surfaces ────────────────────────────────────────────────────────────────
  base:      '#1C1D2E',  // page background
  baseDeep:  '#161722',  // deeper than base — used for URL inputs to add contrast
  surface:   '#252638',  // nav, panels, secondary surfaces
  card:      '#31344D',  // cards, list items
  elevated:  '#3A3E5C',  // hover states, dropdowns, raised elements

  // ── Borders ─────────────────────────────────────────────────────────────────
  border:       'rgba(255,255,255,0.09)',  // card/section separators
  borderStrong: 'rgba(255,255,255,0.15)',  // input borders, active elements

  // ── Text hierarchy — five tiers, strictly enforced ───────────────────────────
  //
  //  textPrimary   #F0F2F8  → titles, card names, nav items, button labels
  //  textSecondary #9CA3AF  → descriptions, form labels, supporting content
  //  textMuted     #6B7280  → helper text, timestamps, low-priority labels
  //  textDim       #4B5563  → decorative chrome only — never for readable content
  //  textUrl       #F3F4F6  → URL / code fields — near-white, signals "copy me"
  //
  //  Rule: never use textMuted for anything interactive or quickly scanned.
  //  Use textSecondary minimum for all actionable or important supporting content.
  //
  textPrimary:   '#F0F2F8',  // titles, names, primary content, button labels
  textSecondary: '#9CA3AF',  // descriptions, labels, supporting text
  textMuted:     '#6B7280',  // helper text, timestamps, low-priority labels
  textDim:       '#4B5563',  // decorative only — never for content
  textUrl:       '#F3F4F6',  // URL/code inputs — near-white, "this is the thing to copy"

  // ── Primary accent — violet ──────────────────────────────────────────────────
  violet:      '#7C3AED',
  violetHover: '#8B5CF6',
  violetLight: '#A78BFA',
  violetSoft:  'rgba(124,58,237,0.12)',
  violetSoft2: 'rgba(124,58,237,0.18)',

  // ── Secondary accent — blue (links, secondary actions) ───────────────────────
  blue:      '#295FFF',
  blueHover: '#3B74FF',
  blueSoft:  'rgba(41,95,255,0.12)',

  // ── Semantic — never use decoratively ───────────────────────────────────────
  green:     '#22C55E',
  greenSoft: 'rgba(34,197,94,0.12)',
  amber:     '#F59E0B',
  amberSoft: 'rgba(245,158,11,0.12)',
  red:       '#FC8181',  // Tailwind red-400 — readable on all dark surfaces
  redSoft:   'rgba(252,129,129,0.12)',
} as const

export const radius = {
  sm:   '6px',
  md:   '8px',
  lg:   '10px',
  xl:   '12px',
  full: '9999px',
} as const

export const font = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const

export const transition = {
  fast:   '0.09s ease',  // active/press snap-back
  normal: '0.14s ease',  // hover-in
} as const

// ─── Navigation structure reference ──────────────────────────────────────────
//
// Admin top nav:   Shows · People · Availability · Conflicts · More
// Member top nav:  Shows · Availability · More
//
// More (admin):    Venues · Songs · ─── · Settings
// More (member):   Account · Help · ─── · Back to Admin  (owner/editor only)
//
// Settings contains:
//   Project Settings — name, shareable calendar, invite/member permissions
//   Team / Access   — Members (app users, not performers)
//   Planning Defaults — Roles · Providers · Default Roster
//
// People = performers / crew / resources (NOT app access)
// Members = users with ShowFlows access to this project (NOT performers)
//
// Collapse priority (admin, step by step):
//   1. Venues / Songs / Settings — always in More (never top-level)
//   2. People → More
//   3. Availability → More
//   4. Full Admin|Member pill → compact "Admin ▾" pill
//   5. Project name truncates: 240 → 200 → 170 → 140px
//   6. Logo wordmark hides, SF mark stays
//   7. Avatar → More  (extreme mobile only)
//
// Protected — never collapse:
//   Shows · Conflicts · Mode control
