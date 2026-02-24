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
  // practical UI validation
  return v.includes('@') && v.includes('.') && v.length >= 6
}

export default function ProjectMembers({ project }: { project: Project }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('member')
  const [isManaged, setIsManaged] = useState(false)

  // For non-managed members, default to invite flow
  const [sendInviteEmail, setSendInviteEmail] = useState(true)

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const trimmedEmail = useMemo(() => email.trim().toLowerCase(), [email])

  const loadMembers = async () => {
    const { data, error } = await supabase
      .from('project_members')
      .select('id,project_id,member_email,role,is_managed,created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })

    if (error) throw error
    setMembers((data ?? []) as Member[])
  }

  const loadInvites = async () => {
    const { data, error } = await supabase
      .from('project_invites')
      .select(
        'id,project_id,invited_email,role,is_managed,token,expires_at,accepted_at,created_at'
      )
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    setInvites((data ?? []) as Invite[])
  }

  const refresh = async () => {
    setMsg('')
    try {
      await Promise.all([loadMembers(), loadInvites()])
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

  const createInviteAndSendEmail = async () => {
    const res = await fetch('/api/invites/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id,
        invitedEmail: trimmedEmail,
        role,
        isManaged: false,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `Invite API failed (${res.status}). ${text || 'Check /api/invites/create'}`
      )
    }
  }

  const addMember = async () => {
    setMsg('')

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
          setMsg('Invite created and email sent.')
        } else {
          // allowed for early testing; you can remove later if you want
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
    setMsg('')
    const { error } = await supabase.from('project_members').update(patch).eq('id', id)

    if (error) {
      setMsg(`Error updating member: ${error.message}`)
      return
    }

    await refresh()
  }

  const removeMember = async (id: string) => {
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
    const url = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setMsg('Invite link copied to clipboard.')
    } catch {
      setMsg(`Copy failed. Here is the link: ${url}`)
    }
  }

  const pendingInvites = invites.filter((i) => !i.accepted_at)

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Members — {project.name}</h3>

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
        Use <b>Managed member</b> for people you’ll manage (they may never log in). For everyone else,
        use <b>Send invite email</b> so they can join cleanly and self-manage later.
      </p>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <table style={{ marginTop: 16, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
              Email
            </th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
              Role
            </th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
              Managed
            </th>
            <th style={{ borderBottom: '1px solid #ddd', padding: 8 }} />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                {m.member_email}
              </td>

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

              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                {m.role !== 'owner' && (
                  <button onClick={() => removeMember(m.id)}>Remove</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {members.length === 0 && (
        <p style={{ marginTop: 12, opacity: 0.8 }}>No members yet — add one above.</p>
      )}

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
    </section>
  )
}