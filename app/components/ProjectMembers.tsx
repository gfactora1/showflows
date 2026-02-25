'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

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

export default function ProjectMembers({ project }: { project: Project }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])

  const [currentEmail, setCurrentEmail] = useState<string>('')
  const [myRole, setMyRole] = useState<Role | null>(null)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('member')
  const [isManaged, setIsManaged] = useState(false)

  // For non-managed members, default to invite flow
  const [sendInviteEmail, setSendInviteEmail] = useState(true)

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

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

  // ✅ FIX: Only load *pending* invites from DB so accepted invites can never “reappear”
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
      setMsg(`Error loading: ${e?.message ?? String(e)}`)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  useEffect(() => {
    // If managed, we never send invites
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

  // ✅ include Authorization Bearer token so /api/invites/create can authenticate
  const createInviteAndSendEmail = async () => {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession()
    if (sessErr) throw sessErr

    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      throw new Error('Not authenticated (no session token). Please log in again.')
    }

    const res = await fetch('/api/invites/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
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

    // surface warning if API returns one
    try {
      const json = JSON.parse(text || '{}')
      if (json?.warning) setMsg(String(json.warning))
    } catch {
      // ignore
    }
  }

  const addMember = async () => {
    setMsg('')

    if (!canManage) {
      setMsg('Not allowed.')
      return
    }

    if (!trimmedEmail) {
      setMsg('Please enter an email.')
      return
    }
    if (!isValidEmail(trimmedEmail)) {
      setMsg('That email does not look valid.')
      return
    }

    setLoading(true)
    try {
      if (isManaged) {
        await addMemberDirect()
        setMsg('Managed member added.')
      } else {
        if (sendInviteEmail) {
          await createInviteAndSendEmail()
          if (!msg) setMsg('Invite created.')
        } else {
          await addMemberDirect()
          setMsg('Member added (no invite sent).')
        }
      }

      setEmail('')
      setRole('member')
      setIsManaged(false)
      setSendInviteEmail(true)
      await refresh()
    } catch (e: any) {
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
      setMsg(`Error updating member: ${error.message}`)
      return
    }

    await refresh()
  }

  const removeMember = async (id: string) => {
    if (!canManage) return

    setMsg('')
    const ok = confirm('Remove this member?')
    if (!ok) return

    const { error } = await supabase.from('project_members').delete().eq('id', id)
    if (error) {
      setMsg(`Error removing member: ${error.message}`)
      return
    }

    await refresh()
  }

  const revokeInvite = async (inviteId: string) => {
    if (!canManage) return

    setMsg('')
    const ok = confirm('Revoke this invite?')
    if (!ok) return

    const { error } = await supabase.from('project_invites').delete().eq('id', inviteId)
    if (error) {
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
      setMsg('Invite link copied to clipboard.')
    } catch {
      setMsg(`Copy failed. Here is the link: ${url}`)
    }
  }

  // since we only load pending invites from DB, this is redundant but harmless
  const pendingInvites = invites.filter((i) => !i.accepted_at)

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Members — {project.name}</h3>

      {/* Everyone can see their own role (no hierarchy beyond self) */}
      <p style={{ marginTop: 6, opacity: 0.85 }}>
        Your role: <b>{myRole ?? 'unknown'}</b>
      </p>

      {/* Management UI: only owners/editors */}
      {canManage && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@email.com"
              style={{ padding: 8, width: 260 }}
            />

            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)}
              style={{ padding: 8 }}
            >
              <option value="editor">editor</option>
              <option value="member">member</option>
              <option value="readonly">readonly</option>
            </select>

            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={isManaged}
                onChange={(e) => setIsManaged(e.target.checked)}
              />
              Managed member
            </label>

            <label
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                opacity: isManaged ? 0.5 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={sendInviteEmail}
                onChange={(e) => setSendInviteEmail(e.target.checked)}
                disabled={isManaged}
              />
              Send invite email
            </label>

            <button onClick={addMember} disabled={loading}>
              {loading ? 'Adding...' : 'Add'}
            </button>
          </div>

          <p style={{ marginTop: 10, opacity: 0.8, maxWidth: 900 }}>
            Use <b>Managed member</b> for people you’ll manage (they may never log in). For everyone
            else, use <b>Send invite email</b> so they can join cleanly and self-manage later.
          </p>
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      {/* Roster: everyone sees the list of users.
          Only owners/editors see role+managed+controls. */}
      <table style={{ marginTop: 16, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Email</th>

            {canManage && (
              <>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                  Role
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                  Managed
                </th>
                <th style={{ borderBottom: '1px solid #ddd', padding: 8 }} />
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{m.member_email}</td>

              {canManage && (
                <>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    {m.role === 'owner' ? (
                      <span>owner</span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={(e) => updateMember(m.id, { role: e.target.value as Role })}
                        style={{ padding: 6 }}
                      >
                        <option value="editor">editor</option>
                        <option value="member">member</option>
                        <option value="readonly">readonly</option>
                      </select>
                    )}
                  </td>

                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    <input
                      type="checkbox"
                      checked={m.is_managed}
                      onChange={(e) => updateMember(m.id, { is_managed: e.target.checked })}
                      disabled={m.role === 'owner'}
                    />
                  </td>

                  <td
                    style={{
                      padding: 8,
                      borderBottom: '1px solid #f0f0f0',
                      textAlign: 'right',
                    }}
                  >
                    {m.role !== 'owner' && <button onClick={() => removeMember(m.id)}>Remove</button>}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {members.length === 0 && <p style={{ marginTop: 12, opacity: 0.8 }}>No members yet.</p>}

      {/* Pending invites: only owners/editors */}
      {canManage && (
        <div style={{ marginTop: 28 }}>
          <h4 style={{ marginBottom: 8 }}>Pending Invites</h4>

          {pendingInvites.length === 0 ? (
            <p style={{ marginTop: 0, opacity: 0.8 }}>No pending invites.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                    Invited Email
                  </th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                    Role
                  </th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                    Expires
                  </th>
                  <th style={{ borderBottom: '1px solid #ddd', padding: 8 }} />
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                      {inv.invited_email}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{inv.role}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                      {new Date(inv.expires_at).toLocaleString()}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                      <button onClick={() => copyInviteLink(inv.token)} style={{ marginRight: 8 }}>
                        Copy link
                      </button>
                      <button onClick={() => revokeInvite(inv.id)}>Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}