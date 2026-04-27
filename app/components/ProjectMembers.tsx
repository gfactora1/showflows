'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { colors, radius, font } from './tokens'

type Project = {
  id: string
  name: string
  color: string
  created_at: string
}

type Role = 'owner' | 'editor' | 'member' | 'readonly'

type Member = {
  id: string
  project_id: string
  member_email: string
  role: Role
  is_managed: boolean
  created_at: string
}

type Invite = {
  id: string
  project_id: string
  invited_email: string
  role: Exclude<Role, 'owner'>
  is_managed: boolean
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

function isValidEmail(input: string) {
  const v = input.trim().toLowerCase()
  return v.includes('@') && v.includes('.') && v.length >= 6
}

const roleBadgeStyle = (role: Role): React.CSSProperties => {
  if (role === 'owner') return {
    fontSize: 11, fontWeight: 600, color: colors.violetLight,
    background: colors.violetSoft, border: `1px solid ${colors.violetSoft2}`,
    borderRadius: radius.full, padding: '2px 8px',
  }
  if (role === 'editor') return {
    fontSize: 11, fontWeight: 600, color: colors.textSecondary,
    background: colors.elevated, border: `1px solid ${colors.border}`,
    borderRadius: radius.full, padding: '2px 8px',
  }
  return {
    fontSize: 11, fontWeight: 600, color: colors.textMuted,
    background: colors.card, border: `1px solid ${colors.border}`,
    borderRadius: radius.full, padding: '2px 8px',
  }
}

export default function ProjectMembers({ project }: { project: Project }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])

  const [currentEmail, setCurrentEmail] = useState<string>('')
  const [myRole, setMyRole] = useState<Role | null>(null)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('member')
  const [isManaged, setIsManaged] = useState(false)
  const [sendInviteEmail, setSendInviteEmail] = useState(true)

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgIsError, setMsgIsError] = useState(false)

  const trimmedEmail = useMemo(() => email.trim().toLowerCase(), [email])

  const canManage = myRole === 'owner' || myRole === 'editor'

  const loadCurrentUserEmail = async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    const em = (data.user?.email ?? '').trim().toLowerCase()
    setCurrentEmail(em)
    return em
  }

  const loadMembers = async (em: string) => {
    const { data, error } = await supabase
      .from('project_members')
      .select('id,project_id,member_email,role,is_managed,created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })

    if (error) throw error
    const rows = (data ?? []) as Member[]
    setMembers(rows)

    const me = rows.find((m) => m.member_email?.toLowerCase() === em)
    const roleFound = (me?.role ?? null) as Role | null
    setMyRole(roleFound)

    return roleFound
  }

  const loadPendingInvites = async () => {
    if (!canManage) {
      setInvites([])
      return
    }

    const { data, error } = await supabase
      .from('project_invites')
      .select('id,project_id,invited_email,role,is_managed,token,expires_at,accepted_at,created_at')
      .eq('project_id', project.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    setInvites((data ?? []) as Invite[])
  }

  const refresh = async () => {
    setMsg('')
    try {
      const em = currentEmail || (await loadCurrentUserEmail())
      const roleFound = await loadMembers(em)

      if (roleFound === 'owner' || roleFound === 'editor') {
        await loadPendingInvites()
      } else {
        setInvites([])
      }
    } catch (e: any) {
      setMsgIsError(true)
      setMsg(`Error loading: ${e?.message ?? String(e)}`)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  useEffect(() => {
    if (isManaged) setSendInviteEmail(false)
  }, [isManaged])

  const addMemberDirect = async () => {
    const { error } = await supabase.from('project_members').insert({
      project_id: project.id,
      member_email: trimmedEmail,
      role,
      is_managed: isManaged,
    })
    if (error) throw error
  }

  const createInviteAndSendEmail = async () => {
    const res = await fetch('/api/invites/create', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id,
        invitedEmail: trimmedEmail,
        role,
        isManaged: false,
      }),
    })

    const text = await res.text().catch(() => '')
    if (!res.ok) {
      throw new Error(`Invite API failed (${res.status}). ${text || 'Check /api/invites/create'}`)
    }

    try {
      const json = JSON.parse(text || '{}')
      if (json?.warning) {
        setMsgIsError(false)
        setMsg(String(json.warning))
      }
    } catch {
      // ignore
    }
  }

  const addMember = async () => {
    setMsg('')

    if (!canManage) return setMsg('Not allowed.')
    if (!trimmedEmail) return setMsg('Please enter an email.')
    if (!isValidEmail(trimmedEmail)) return setMsg('That email does not look valid.')

    setLoading(true)
    try {
      if (isManaged) {
        await addMemberDirect()
        setMsgIsError(false)
        setMsg('Managed member added.')
      } else {
        if (sendInviteEmail) {
          await createInviteAndSendEmail()
          if (!msg) { setMsgIsError(false); setMsg('Invite sent.') }
        } else {
          await addMemberDirect()
          setMsgIsError(false)
          setMsg('Member added (no invite sent).')
        }
      }

      setEmail('')
      setRole('member')
      setIsManaged(false)
      setSendInviteEmail(true)
      await refresh()
    } catch (e: any) {
      setMsgIsError(true)
      setMsg(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const updateMember = async (id: string, patch: Partial<Member>) => {
    if (!canManage) return

    setMsg('')
    const { error } = await supabase.from('project_members').update(patch).eq('id', id)

    if (error) {
      setMsgIsError(true)
      setMsg(`Error updating member: ${error.message}`)
      return
    }

    await refresh()
  }

  const removeMember = async (id: string) => {
    if (!canManage) return
    if (!confirm('Remove this member?')) return

    setMsg('')
    const { error } = await supabase.from('project_members').delete().eq('id', id)
    if (error) {
      setMsgIsError(true)
      setMsg(`Error removing member: ${error.message}`)
      return
    }

    await refresh()
  }

  const revokeInvite = async (inviteId: string) => {
    if (!canManage) return
    if (!confirm('Revoke this invite?')) return

    setMsg('')
    const { error } = await supabase.from('project_invites').delete().eq('id', inviteId)
    if (error) {
      setMsgIsError(true)
      setMsg(`Error revoking invite: ${error.message}`)
      return
    }

    await refresh()
  }

  const copyInviteLink = async (token: string) => {
    if (!canManage) return

    const url = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setMsgIsError(false)
      setMsg('Invite link copied to clipboard.')
    } catch {
      setMsgIsError(false)
      setMsg(`Copy failed. Link: ${url}`)
    }
  }

  const pendingInvites = invites.filter((i) => !i.accepted_at)

  const cellStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: 14,
    color: colors.textPrimary,
    verticalAlign: 'middle',
  }

  const headerCellStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: `1px solid ${colors.borderStrong}`,
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    textAlign: 'left' as const,
  }

  return (
    <section style={{ fontFamily: font.sans }}>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
        Team / Access
      </h3>

      {/* Current user's role */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, color: colors.textSecondary }}>Your role:</span>
        {myRole && <span style={roleBadgeStyle(myRole)}>{myRole}</span>}
      </div>

      {/* Add member form — owners/editors only */}
      {canManage && (
        <div style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: '16px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Add a Member
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@email.com"
              onKeyDown={(e) => e.key === 'Enter' && addMember()}
              className="input-field"
              style={{ fontFamily: font.sans, width: 240 }}
            />

            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)}
              className="input-select"
              style={{ fontFamily: font.sans }}
            >
              <option value="editor">Editor</option>
              <option value="member">Member</option>
              <option value="readonly">Read-only</option>
            </select>

            <button onClick={addMember} disabled={loading} className="btn-primary">
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isManaged}
                onChange={(e) => setIsManaged(e.target.checked)}
                style={{ accentColor: colors.violet, width: 14, height: 14 }}
              />
              <span style={{ fontSize: 13, color: colors.textSecondary }}>Managed member</span>
            </label>

            <label style={{
              display: 'flex', gap: 8, alignItems: 'center', cursor: isManaged ? 'default' : 'pointer',
              opacity: isManaged ? 0.45 : 1,
            }}>
              <input
                type="checkbox"
                checked={sendInviteEmail}
                onChange={(e) => setSendInviteEmail(e.target.checked)}
                disabled={isManaged}
                style={{ accentColor: colors.violet, width: 14, height: 14 }}
              />
              <span style={{ fontSize: 13, color: colors.textSecondary }}>Send invite email</span>
            </label>
          </div>

          <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12, color: colors.textMuted, maxWidth: 560, lineHeight: 1.5 }}>
            Use <span style={{ color: colors.textSecondary, fontWeight: 500 }}>Managed member</span> for people you'll manage who may never log in. For everyone else, use <span style={{ color: colors.textSecondary, fontWeight: 500 }}>Send invite email</span> so they can join and self-manage.
          </p>
        </div>
      )}

      {msg && (
        <p style={{ marginBottom: 16, fontSize: 13, color: msgIsError ? colors.red : colors.green }}>
          {msg}
        </p>
      )}

      {/* Members table */}
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
        marginBottom: 28,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.card }}>
              <th style={headerCellStyle}>Email</th>
              {canManage && (
                <>
                  <th style={headerCellStyle}>Role</th>
                  <th style={headerCellStyle}>Managed</th>
                  <th style={{ ...headerCellStyle, width: 80 }} />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td
                  colSpan={canManage ? 4 : 1}
                  style={{ ...cellStyle, color: colors.textMuted, textAlign: 'center', padding: '20px 12px' }}
                >
                  No members yet.
                </td>
              </tr>
            ) : members.map((m) => (
              <tr key={m.id}>
                <td style={cellStyle}>
                  <span style={{ color: colors.textPrimary }}>{m.member_email}</span>
                </td>

                {canManage && (
                  <>
                    <td style={cellStyle}>
                      {m.role === 'owner' ? (
                        <span style={roleBadgeStyle('owner')}>owner</span>
                      ) : (
                        <select
                          value={m.role}
                          onChange={(e) => updateMember(m.id, { role: e.target.value as Role })}
                          className="input-select"
                          style={{ fontFamily: font.sans, fontSize: 13, padding: '4px 8px' }}
                        >
                          <option value="editor">Editor</option>
                          <option value="member">Member</option>
                          <option value="readonly">Read-only</option>
                        </select>
                      )}
                    </td>

                    <td style={cellStyle}>
                      <input
                        type="checkbox"
                        checked={m.is_managed}
                        onChange={(e) => updateMember(m.id, { is_managed: e.target.checked })}
                        disabled={m.role === 'owner'}
                        style={{ accentColor: colors.violet, width: 14, height: 14 }}
                      />
                    </td>

                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      {m.role !== 'owner' && (
                        <button
                          onClick={() => removeMember(m.id)}
                          className="btn-link-danger"
                          style={{ fontSize: 13 }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending invites — owners/editors only */}
      {canManage && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>
            Pending Invites
          </div>

          {pendingInvites.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: 14, marginTop: 0 }}>
              No pending invites.
            </p>
          ) : (
            <div style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.lg,
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: colors.card }}>
                    <th style={headerCellStyle}>Invited Email</th>
                    <th style={headerCellStyle}>Role</th>
                    <th style={headerCellStyle}>Expires</th>
                    <th style={{ ...headerCellStyle, width: 140 }} />
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map((inv) => (
                    <tr key={inv.id}>
                      <td style={cellStyle}>{inv.invited_email}</td>
                      <td style={cellStyle}>
                        <span style={roleBadgeStyle(inv.role)}>{inv.role}</span>
                      </td>
                      <td style={{ ...cellStyle, color: colors.textSecondary, fontSize: 13 }}>
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>
                        <button
                          onClick={() => copyInviteLink(inv.token)}
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                        >
                          Copy link
                        </button>
                        <button
                          onClick={() => revokeInvite(inv.id)}
                          className="btn-link-danger"
                          style={{ fontSize: 12 }}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
