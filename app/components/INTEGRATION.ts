// ─────────────────────────────────────────────────────────────────────────────
// ShowFlows — AppNav Integration Guide
// ─────────────────────────────────────────────────────────────────────────────
//
// Files to add to your repo:
//   app/components/tokens.ts    ← design system constants
//   app/components/AppNav.tsx   ← adaptive nav component
//
// No new npm packages required.

// ── Step 1: app/layout.tsx ───────────────────────────────────────────────────
//
// Create or replace app/layout.tsx:
//
// import type { Metadata } from 'next'
// import { colors, font } from '../components/tokens'
//
// export const metadata: Metadata = {
//   title: 'ShowFlows',
//   description: 'Show scheduling for bands and live production teams',
// }
//
// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return (
//     <html lang="en">
//       <body style={{
//         margin: 0, padding: 0,
//         background: colors.base,
//         color: colors.textPrimary,
//         fontFamily: font.sans,
//         minHeight: '100vh',
//       }}>
//         {children}
//       </body>
//     </html>
//   )
// }

// ── Step 2: Projects.tsx changes ─────────────────────────────────────────────
//
// Add these imports at the top:
//   import AppNav from './AppNav'
//   import type { AdminSection, MemberSection } from './AppNav'
//
// Add this state alongside existing useState calls:
//   const [viewMode, setViewMode] = useState<'admin' | 'member'>('admin')
//   const [activeSection, setActiveSection] = useState<AdminSection | MemberSection>('shows')
//
// Extract real user initials after auth.getUser():
//   const fullName = userData?.user?.user_metadata?.full_name
//     ?? userData?.user?.email
//     ?? 'U'
//   const initials = fullName
//     .split(' ')
//     .map((n: string) => n[0])
//     .join('')
//     .toUpperCase()
//     .slice(0, 2)
//
// Replace the outer <section> with:
//
//   <>
//     <AppNav
//       projects={projects}
//       selectedProject={selectedProject}
//       onSelectProject={(p) => {
//         setSelectedProject(p)
//         // viewMode intentionally NOT reset — persists across project switches
//       }}
//       myRole={myRole}
//       viewMode={viewMode}
//       onViewModeChange={setViewMode}
//       activeSection={activeSection}
//       onNavigate={setActiveSection}
//       userInitials={initials}
//       conflictCount={0}  // wire to real count when available (see Step 4)
//     />
//
//     <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
//       {selectedProject ? (
//         <ProjectDetail
//           project={selectedProject}
//           myRole={myRole}
//           viewMode={viewMode}
//           activeSection={activeSection}
//         />
//       ) : (
//         <p style={{ color: colors.textSecondary }}>
//           Select a project to get started.
//         </p>
//       )}
//     </div>
//   </>

// ── Step 3: ProjectDetail.tsx changes ────────────────────────────────────────
//
// Update Props type:
//   type Props = {
//     project: Project
//     myRole: Role | null
//     viewMode: 'admin' | 'member'        // ADD
//     activeSection?: string              // ADD
//   }
//
// Replace the TABS + tab rendering logic:
//
//   // Admin tabs — full set
//   const ADMIN_TABS = [
//     { key: 'shows',        label: 'Shows'         },
//     { key: 'people',       label: 'People'        },
//     { key: 'availability', label: 'Availability'  },
//     { key: 'conflicts',    label: '⚡ Conflicts'  },
//     { key: 'venues',       label: 'Venues'        },
//     { key: 'songs',        label: 'Songs'         },
//     { key: 'settings',     label: 'Settings'      },
//   ]
//
//   // Member tabs — simplified
//   const MEMBER_TABS = [
//     { key: 'shows',        label: 'Shows'         },
//     { key: 'availability', label: 'Availability'  },
//   ]
//
//   // Active tab driven by activeSection prop (from AppNav onNavigate)
//   // falling back to internal state for sub-navigation within a section
//   const visibleTabs = viewMode === 'member' ? MEMBER_TABS : ADMIN_TABS
//
// Remove the existing flexWrap: 'wrap' from the tab row — AppNav handles
// navigation now. ProjectDetail tab row can be hidden entirely or kept
// as secondary in-section navigation.

// ── Step 4: Wire conflictCount (optional but recommended) ────────────────────
//
// After selecting a project, fetch the count:
//
//   const [conflictCount, setConflictCount] = useState(0)
//
//   useEffect(() => {
//     if (!selectedProject) return
//     fetch(`/api/projects/${selectedProject.id}/billing-status`, {
//       credentials: 'include',
//     })
//       .then(r => r.json())
//       .then(data => setConflictCount(data.conflictCount ?? 0))
//       .catch(() => {})
//   }, [selectedProject?.id])
//
// Then pass: conflictCount={conflictCount}
// The red dot on Conflicts appears automatically when count > 0.

// ── Step 5: Settings section (future) ────────────────────────────────────────
//
// When activeSection === 'settings', render a Settings component that contains:
//
//   Project Settings
//     - Project name / details
//     - Shareable calendar settings
//     - Invite / member permissions
//
//   Team / Access
//     - Members (ProjectMembers component — app users, not performers)
//
//   Planning Defaults
//     - Roles
//     - Providers
//     - Default Roster
//
// This replaces the current scattered tabs for these items.
// Build as a single Settings.tsx component with internal sub-navigation.

// ── Behavior contract ─────────────────────────────────────────────────────────
//
// ResizeObserver on nav container fires on every width change.
// computeCollapse() runs the iterative priority loop — no fixed breakpoints.
// All nav items have flexShrink: 0 — they never compress, they move to More.
// overflow: hidden on nav shell is a safety net, not the primary mechanism.
// More button width is pre-budgeted in totalWidth() at all times in admin mode.
// viewMode persists across project switches — no accidental resets.
// Toggle only renders for owner and editor roles in the current project.
