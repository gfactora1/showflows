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

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('member')
  const [isManaged, setIsManaged] = useState(false)
  const [sendInviteEmail, setSendInviteEmail] = useState(true)

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [myEmail, setMyEmail] = useState<string>('')
  const [myRole, setMyRole] = useState<Role | null>(null)

  const trimmedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const canManageMembers = myRole === 'owner' || myRole === 'editor'

  const loadMembers = async () => {
    const { data, error } = await supabase
      .from('project_members')
      .select('id,project_id,member_email,role,is_managed,created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })

    if (error) throw error

    const rows = (data ?? []) as Member[]
    setMembers(rows)

    if (myEmail) {
      const me = rows.find(
        (m) => m.member_email?.toLowerCase() === myEmail.toLowerCase()
      )
      setMyRole(me?.role ?? null)
    }
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
    supabase.auth.getSession().then(({ data }) => {
      const sessionEmail = data.session?.user?.email ?? ''
      setMyEmail(sessionEmail)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [project.id, myEmail])

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
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) throw new Error('Not logged in.')

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
      throw new Error(`Invite API failed (${res.status}). ${text || ''}`.trim())
    }
  }

  const addMember = async () => {
    setMsg('')

    if (!canManageMembers) return

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
          setMsg('Invite created.')
        } else {
          await addMemberDirect()
          setMsg('Member added.')
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

  const pendingInvites = invites.filter((i) => !i.accepted_at)

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Members — {project.name}</h3>

      {myRole && (
        <p style={{ marginTop: 6, marginBottom: 14, opacity: 0.8 }}>
          Role: <b>{myRole}</b>
        </p>
      )}

      {canManageMembers && (
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
            Use <b>Managed member</b> for people you’ll manage. For everyone else,
            use <b>Send invite email</b> so they can join cleanly later.
          </p>
        </>
      )}

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
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                {m.member_email}
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                {m.role}
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                <input type="checkbox" checked={m.is_managed} disabled />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 28 }}>
        <h4 style={{ marginBottom: 8 }}>Pending Invites</h4>

        {canManageMembers ? (
          pendingInvites.length === 0 ? (
            <p style={{ marginTop: 0, opacity: 0.8 }}>No pending invites.</p>
          ) : (
            <p>Invite list visible here.</p>
          )
        ) : (
          <p style={{ marginTop: 0, opacity: 0.6 }}>
            Pending invites are only visible to owners and editors.
          </p>
        )}
      </div>
    </section>
  )
}