'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { colors, radius, transition, font } from './tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'owner' | 'editor' | 'member' | 'readonly'
type ViewMode = 'admin' | 'member'

export interface Project {
  id: string
  name: string
  color: string
}

export interface AppNavProps {
  projects: Project[]
  selectedProject: Project | null
  onSelectProject: (project: Project) => void
  myRole: Role | null
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  activeSection?: AdminSection | MemberSection
  onNavigate?: (section: AdminSection | MemberSection) => void
  userInitials?: string
  conflictCount?: number
  onCreateProject?: () => void
  onLogout?: () => void
}

export type AdminSection =
  | 'shows'
  | 'people'
  | 'availability'
  | 'conflicts'
  | 'venues'
  | 'songs'
  | 'settings'

export type MemberSection = 'shows' | 'availability'

// ─── Width budget constants (px) ─────────────────────────────────────────────
// Approximate natural rendered widths for each nav element.
// ResizeObserver provides actual container width — these drive the collapse math.

const W = {
  logoFull:       108, // SF mark + "ShowFlows" wordmark
  logoMark:        38, // SF mark only
  switcherMax:    240,
  switcherMedium: 200,
  switcherNarrow: 170,
  switcherMin:    140,
  shows:           68,
  conflicts:       88, // wider — dot badge adds visual space
  people:          72,
  availability:   100,
  more:            68, // "More ▾" button — always present in admin
  toggleFull:     114, // "Admin | Member" full pill
  toggleCompact:   96, // "Admin ▾" compact pill
  avatar:          42, // circle + left margin
  padding:         24, // nav left + right padding total
  gap:              8, // gap between each item group
} as const

// ─── Collapse state ───────────────────────────────────────────────────────────

interface CollapseState {
  peopleInMore:   boolean // step 2 — collapses before Availability
  availInMore:    boolean // step 3
  compactToggle:  boolean // step 4 — full pill → compact pill
  narrowSwitcher: boolean // step 5 — project name truncates
  narrowLogo:     boolean // step 6 — wordmark hides, SF mark stays
  avatarInMore:   boolean // step 7 — last resort, extreme mobile
}

function totalWidth(s: CollapseState, isMember: boolean): number {
  const logo = s.narrowLogo ? W.logoMark : W.logoFull
  const switcher = s.avatarInMore
    ? W.switcherMin
    : s.narrowSwitcher
    ? W.switcherNarrow
    : s.compactToggle
    ? W.switcherMedium
    : W.switcherMax
  const toggle = s.compactToggle ? W.toggleCompact : W.toggleFull
  const avatar = s.avatarInMore ? 0 : W.avatar

  // Nav links visible in top bar
  let links = W.shows // always
  if (!isMember) {
    links += W.conflicts // always in admin
    if (!s.peopleInMore) links += W.people
    if (!s.availInMore)  links += W.availability
  } else {
    links += W.availability // always in member
  }

  // More is always present in admin (Venues/Songs/Settings live there permanently)
  // In member mode it's always present too
  const moreW = W.more

  return (
    W.padding +
    logo + W.gap +
    switcher + W.gap +
    links + W.gap +
    moreW + W.gap +
    toggle + W.gap +
    avatar
  )
}

function computeCollapse(available: number, isMember: boolean): CollapseState {
  const s: CollapseState = {
    peopleInMore:   false,
    availInMore:    false,
    compactToggle:  false,
    narrowSwitcher: false,
    narrowLogo:     false,
    avatarInMore:   false,
  }

  const fits = () => totalWidth(s, isMember) <= available
  if (fits()) return s

  // Step 2: People → More (admin only)
  if (!isMember) {
    s.peopleInMore = true
    if (fits()) return s

    // Step 3: Availability → More (admin only)
    s.availInMore = true
    if (fits()) return s
  }

  // Step 4: Full pill → compact pill
  s.compactToggle = true
  if (fits()) return s

  // Step 5: Project name truncates
  s.narrowSwitcher = true
  if (fits()) return s

  // Step 6: Logo wordmark hides
  s.narrowLogo = true
  if (fits()) return s

  // Step 7: Avatar → More (last resort)
  s.avatarInMore = true
  return s
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavDropdown({
  open,
  alignRight = true,
  children,
}: {
  open: boolean
  alignRight?: boolean
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: 52,
        ...(alignRight ? { right: 0 } : { left: 0 }),
        background: colors.card,
        border: `1px solid ${colors.borderStrong}`,
        borderRadius: radius.lg,
        padding: 4,
        minWidth: 172,
        zIndex: 200,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      {children}
    </div>
  )
}

function DropItem({
  label,
  active,
  muted,
  suffix,
  onClick,
}: {
  label: string
  active?: boolean
  muted?: boolean
  suffix?: React.ReactNode
  onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 11px',
        borderRadius: radius.sm,
        fontSize: 13,
        color: active
          ? colors.violet
          : muted
          ? colors.textMuted
          : colors.textSecondary,
        background: hovered ? colors.elevated : 'transparent',
        cursor: 'pointer',
        transition: `background ${transition.normal}`,
        userSelect: 'none',
      }}
    >
      <span>{label}</span>
      {suffix}
    </div>
  )
}

function DropDivider() {
  return (
    <div style={{ height: 1, background: colors.border, margin: '3px 0' }} />
  )
}

function NavLink({
  label,
  active,
  showDot,
  onClick,
}: {
  label: string
  active: boolean
  showDot?: boolean
  onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '5px 10px',
        borderRadius: radius.sm,
        fontSize: 13,
        fontWeight: active ? 500 : 400,
        color: active
          ? colors.violet
          : hovered
          ? colors.textPrimary
          : colors.textSecondary,
        background: active
          ? colors.violetSoft2
          : hovered
          ? 'rgba(255,255,255,0.05)'
          : 'transparent',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: `background ${transition.normal}, color ${transition.normal}`,
        userSelect: 'none',
      }}
    >
      {label}
      {showDot && (
        <div
          style={{
            position: 'absolute',
            top: 3,
            right: 4,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: colors.red,
            border: `1.5px solid ${colors.surface}`,
          }}
        />
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AppNav({
  projects,
  selectedProject,
  onSelectProject,
  myRole,
  viewMode,
  onViewModeChange,
  activeSection = 'shows',
  onNavigate,
  userInitials = '??',
  conflictCount = 0,
  onCreateProject,
  onLogout,
}: AppNavProps) {
  const navRef = useRef<HTMLDivElement>(null)
  const isMember = viewMode === 'member'
  const canToggle = myRole === 'owner' || myRole === 'editor'
  const isAdminMode = !isMember

  const [collapse, setCollapse] = useState<CollapseState>({
    peopleInMore:   false,
    availInMore:    false,
    compactToggle:  false,
    narrowSwitcher: false,
    narrowLogo:     false,
    avatarInMore:   false,
  })

  type DropId = 'switcher' | 'more' | 'toggle' | 'avatar' | null
  const [openDrop, setOpenDrop] = useState<DropId>(null)
  const closeAll = useCallback(() => setOpenDrop(null), [])
  const toggleDrop = useCallback(
    (id: Exclude<DropId, null>) =>
      setOpenDrop((prev) => (prev === id ? null : id)),
    []
  )

  // ResizeObserver — primary collapse mechanism
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const run = (w: number) => setCollapse(computeCollapse(w, isMember))
    const ro = new ResizeObserver((entries) =>
      run(entries[0].contentRect.width)
    )
    ro.observe(el)
    run(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [isMember])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) closeAll()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [closeAll])

  const nav = (section: AdminSection | MemberSection) => {
    onNavigate?.(section)
    closeAll()
  }

  const isActive = (s: string) => activeSection === s

  const switcherMaxWidth = collapse.avatarInMore
    ? W.switcherMin
    : collapse.narrowSwitcher
    ? W.switcherNarrow
    : collapse.compactToggle
    ? W.switcherMedium
    : W.switcherMax

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: font.sans }}>

      {/* Top nav bar */}
      <div
        ref={navRef}
        style={{
          background: colors.surface,
          borderBottom: `1px solid ${colors.border}`,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          position: 'relative',
          userSelect: 'none',
        }}
      >

        {/* ── Logo ── */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: radius.sm,
              background: 'linear-gradient(135deg, #295FFF, #7C3AED)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white', letterSpacing: '-0.5px',
            }}
          >
            SF
          </div>
          {!collapse.narrowLogo && (
            <span
              style={{
                fontSize: 15, fontWeight: 600, color: colors.textPrimary,
                letterSpacing: '-0.3px', marginLeft: 8, whiteSpace: 'nowrap',
              }}
            >
              ShowFlows
            </span>
          )}
        </div>

        {/* ── Project switcher ── */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            onClick={() => toggleDrop('switcher')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: colors.card, border: `1px solid ${colors.borderStrong}`,
              borderRadius: radius.md, padding: '4px 9px',
              fontSize: 13, color: colors.textPrimary, cursor: 'pointer',
              maxWidth: switcherMaxWidth, minWidth: 80, overflow: 'hidden',
              transition: `max-width ${transition.normal}`,
            }}
          >
            <div
              style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: selectedProject?.color ?? colors.violet,
              }}
            />
            <span
              style={{
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', minWidth: 0, flex: 1,
              }}
            >
              {selectedProject?.name ?? 'Select project'}
            </span>
            <span style={{ color: colors.textMuted, fontSize: 10, flexShrink: 0, marginLeft: 2 }}>
              ▾
            </span>
          </div>

          <NavDropdown open={openDrop === 'switcher'} alignRight={false}>
            {projects.length === 0 && (
              <div style={{ padding: '8px 11px', fontSize: 12, color: colors.textMuted }}>
                No projects yet
              </div>
            )}
            {projects.map((p) => (
              <DropItem
                key={p.id}
                label={p.name}
                active={p.id === selectedProject?.id}
                suffix={
                  p.id === selectedProject?.id
                    ? <span style={{ fontSize: 11, color: colors.violet }}>✓</span>
                    : undefined
                }
                onClick={() => { onSelectProject(p); closeAll() }}
              />
            ))}
          </NavDropdown>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, minWidth: 8 }} />

        {/* ── Shows — always visible ── */}
        <NavLink
          label="Shows"
          active={isActive('shows')}
          onClick={() => nav('shows')}
        />

        {/* ── People — collapses step 2 (admin only) ── */}
        {!isMember && !collapse.peopleInMore && (
          <NavLink
            label="People"
            active={isActive('people')}
            onClick={() => nav('people')}
          />
        )}

        {/* ── Availability — collapses step 3 in admin; always visible in member ── */}
        {(!isMember && !collapse.availInMore) || isMember ? (
          <NavLink
            label="Availability"
            active={isActive('availability')}
            onClick={() => nav('availability')}
          />
        ) : null}

        {/* ── Conflicts — protected, always visible in admin ── */}
        {!isMember && (
          <NavLink
            label="Conflicts"
            active={isActive('conflicts')}
            showDot={conflictCount > 0}
            onClick={() => nav('conflicts')}
          />
        )}

        {/* ── More — always present (Venues/Songs/Settings always live here) ── */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            onClick={() => toggleDrop('more')}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.background =
                'rgba(255,255,255,0.05)'
              ;(e.currentTarget as HTMLDivElement).style.color = colors.textPrimary
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLDivElement).style.color = colors.textSecondary
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: radius.sm,
              fontSize: 13, color: colors.textSecondary, cursor: 'pointer',
              whiteSpace: 'nowrap', transition: `background ${transition.normal}, color ${transition.normal}`,
            }}
          >
            More
            <span style={{ fontSize: 9, color: colors.textMuted }}>▾</span>
          </div>

          <NavDropdown open={openDrop === 'more'} alignRight>
            {/* Admin-only: dynamically collapsed items appear first */}
            {!isMember && collapse.peopleInMore && (
              <DropItem
                label="People"
                active={isActive('people')}
                onClick={() => nav('people')}
              />
            )}
            {!isMember && collapse.availInMore && (
              <DropItem
                label="Availability"
                active={isActive('availability')}
                onClick={() => nav('availability')}
              />
            )}
            {!isMember && (collapse.peopleInMore || collapse.availInMore) && (
              <DropDivider />
            )}

            {/* Admin: always-in-More items */}
            {!isMember && (
              <>
                <DropItem
                  label="Venues"
                  active={isActive('venues')}
                  onClick={() => nav('venues')}
                />
                <DropItem
                  label="Songs"
                  active={isActive('songs')}
                  onClick={() => nav('songs')}
                />
                <DropDivider />
                <DropItem
                  label="Settings"
                  active={isActive('settings')}
                  onClick={() => nav('settings')}
                />
              </>
            )}

            {/* Member More contents */}
            {isMember && (
              <>
                <DropItem
                  label="Create Project"
                  onClick={() => { closeAll(); onCreateProject?.() }}
                />
                <DropDivider />
                <DropItem label="Account Settings" onClick={closeAll} />
                {canToggle && (
                  <>
                    <DropDivider />
                    <DropItem
                      label="Back to Admin"
                      onClick={() => { onViewModeChange('admin'); closeAll() }}
                    />
                  </>
                )}
                <DropDivider />
                <DropItem
                  label="Sign out"
                  muted
                  onClick={() => { closeAll(); onLogout?.() }}
                />
              </>
            )}
          </NavDropdown>
        </div>

        {/* ── Mode toggle — owner/editor only ── */}
        {canToggle && (
          !collapse.compactToggle ? (
            /* Full segmented pill */
            <div
              style={{
                display: 'flex', alignItems: 'center',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: radius.md, padding: 3, flexShrink: 0,
              }}
            >
              {(['admin', 'member'] as ViewMode[]).map((mode) => {
                const active = viewMode === mode
                return (
                  <div
                    key={mode}
                    onClick={() => { onViewModeChange(mode); closeAll() }}
                    style={{
                      padding: '3px 11px', borderRadius: radius.sm,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: `background ${transition.normal}, color ${transition.normal}`,
                      ...(active && mode === 'admin'
                        ? { background: colors.violet, color: 'white' }
                        : active && mode === 'member'
                        ? { background: 'rgba(255,255,255,0.14)', color: colors.textPrimary,
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }
                        : { color: colors.textMuted }
                      ),
                    }}
                  >
                    {mode === 'admin' ? 'Admin' : 'Member'}
                  </div>
                )
              })}
            </div>
          ) : (
            /* Compact pill + dropdown */
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                onClick={() => toggleDrop('toggle')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: colors.card, border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radius.md, padding: '4px 9px',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  color: isAdminMode ? colors.violet : colors.textPrimary,
                  whiteSpace: 'nowrap',
                  transition: `background ${transition.normal}`,
                }}
              >
                <div
                  style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: isAdminMode ? colors.violet : 'rgba(255,255,255,0.4)',
                  }}
                />
                {isAdminMode ? 'Admin' : 'Member'}
                <span style={{ fontSize: 9, color: colors.textMuted, marginLeft: 2 }}>▾</span>
              </div>

              <NavDropdown open={openDrop === 'toggle'} alignRight>
                <DropItem
                  label="View as Admin"
                  active={isAdminMode}
                  suffix={isAdminMode
                    ? <span style={{ fontSize: 11, color: colors.violet }}>✓</span>
                    : undefined
                  }
                  onClick={() => { onViewModeChange('admin'); closeAll() }}
                />
                <DropItem
                  label="View as Member"
                  active={!isAdminMode}
                  suffix={!isAdminMode
                    ? <span style={{ fontSize: 11, color: colors.textPrimary }}>✓</span>
                    : undefined
                  }
                  onClick={() => { onViewModeChange('member'); closeAll() }}
                />
              </NavDropdown>
            </div>
          )
        )}

        {/* ── Avatar ── */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {!collapse.avatarInMore ? (
            <div
              onClick={() => toggleDrop('avatar')}
              onMouseEnter={(e) =>
                (e.currentTarget as HTMLDivElement).style.background = colors.violetSoft
              }
              onMouseLeave={(e) =>
                (e.currentTarget as HTMLDivElement).style.background = colors.violetSoft2
              }
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: colors.violetSoft2, border: `1.5px solid ${colors.violet}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: colors.violet,
                cursor: 'pointer', transition: `background ${transition.normal}`,
                marginLeft: 2,
              }}
            >
              {userInitials}
            </div>
          ) : (
            /* Avatar folded into compact button — extreme mobile only */
            <div
              onClick={() => toggleDrop('avatar')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: colors.card, border: `1px solid ${colors.borderStrong}`,
                borderRadius: radius.md, padding: '3px 8px', cursor: 'pointer',
                marginLeft: 2,
              }}
            >
              <div
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: colors.violetSoft2, border: `1.5px solid ${colors.violet}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 600, color: colors.violet,
                }}
              >
                {userInitials}
              </div>
              <span style={{ fontSize: 9, color: colors.textMuted }}>▾</span>
            </div>
          )}

          <NavDropdown open={openDrop === 'avatar'} alignRight>
            <DropItem
              label="Create Project"
              onClick={() => { closeAll(); onCreateProject?.() }}
            />
            <DropDivider />
            <DropItem label="Account Settings" onClick={closeAll} />
            <DropDivider />
            <DropItem
              label="Sign out"
              muted
              onClick={() => { closeAll(); onLogout?.() }}
            />
          </NavDropdown>
        </div>

      </div>

      {/* ── Member mode indicator bar ── */}
      {viewMode === 'member' && canToggle && (
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderBottom: `1px solid ${colors.border}`,
            padding: '5px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: font.sans, fontSize: 12, userSelect: 'none',
          }}
        >
          <div
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'rgba(139,92,246,0.55)', flexShrink: 0,
            }}
          />
          <span style={{ color: colors.textMuted }}>
            Viewing as Member — admin tools are hidden
          </span>
          <span
            onClick={() => onViewModeChange('admin')}
            style={{
              marginLeft: 'auto', color: colors.blue, fontWeight: 500,
              cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            Back to Admin →
          </span>
        </div>
      )}

    </div>
  )
}
