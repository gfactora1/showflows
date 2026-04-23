import AcceptInviteClient from './AcceptInviteClient'

type Props = {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  return <AcceptInviteClient token={token} />
}