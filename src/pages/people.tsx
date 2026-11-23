/**
 * People (owner only, P4): who may sign in and with which role. Managers and drivers are added by their Google
 * email; the record is created when that account first signs in (D-22). Loaded on demand, so the Firebase
 * database code is only downloaded when this page opens.
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { useT } from '../app/preferences'
import { useToast } from '../app/toast'
import { errorText, fill } from '../i18n/labels'
import { todayInKolkata } from '../domain'
import { INVITABLE_ROLES, inviteWrites, paths, type DocWrite, type InvitableRole, type InviteDoc, type UserDoc } from '../data/docs'
import { useSession } from '../firebase/session'
import { Button } from '../ui/Button'
import { Field, Segmented } from '../ui/controls'
import { FormSheet } from '../ui/FormSheet'
import { Card, EmptyState, PageHeader, Pill, Row, Section } from '../ui/primitives'

type Person = UserDoc & { uid: string }

export default function PeoplePage() {
  const t = useT()
  const toast = useToast()
  const { session, services, write } = useSession()
  const [people, setPeople] = useState<Person[]>([])
  const [invites, setInvites] = useState<InviteDoc[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitableRole>('driver')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<Person>()

  const me = session.status === 'ready' ? session.account.uid : undefined
  const isOwner = session.status === 'ready' && session.user.role === 'owner'

  useEffect(() => {
    if (!services || !isOwner) return
    const stopPeople = onSnapshot(collection(services.db, 'users'), (snap) =>
      setPeople(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) })).sort((a, b) => a.name.localeCompare(b.name))),
    )
    const stopInvites = onSnapshot(collection(services.db, 'invites'), (snap) =>
      setInvites(snap.docs.map((d) => d.data() as InviteDoc).sort((a, b) => a.name.localeCompare(b.name))),
    )
    return () => {
      stopPeople()
      stopInvites()
    }
  }, [services, isOwner])

  const save = async (writes: DocWrite[], done?: string) => {
    setBusy(true)
    try {
      await write(writes)
      if (done) toast(done)
      return true
    } catch {
      toast(t.people.failed)
      return false
    } finally {
      setBusy(false)
    }
  }

  const roleOptions = INVITABLE_ROLES.map((r) => ({ value: r, label: t.roles[r] }))

  if (!isOwner || !me) {
    return (
      <>
        <PageHeader title={t.people.title} back={{ to: '/more', label: t.more.back }} />
        <Card className="mt-2">
          <EmptyState icon="customers" message={session.status === 'demo' ? t.people.demoOnly : t.profile.ownerOnly} />
        </Card>
      </>
    )
  }

  const onInvite = async () => {
    const writes = inviteWrites({ email, name, role }, me, todayInKolkata())
    if (!writes.ok) {
      setError(errorText(t, writes.error) + ` (${writes.error.message})`)
      return
    }
    setError(undefined)
    const added = name.trim()
    const address = email.trim().toLowerCase()
    if (await save(writes.value, fill(t.people.inviteSent, { name: added, email: address }))) {
      setName('')
      setEmail('')
    }
  }

  return (
    <>
      <PageHeader title={t.people.title} subtitle={t.people.intro} back={{ to: '/more', label: t.more.back }} />

      <Section header={t.people.team} footer={t.people.ownerNote}>
        {people.map((p) => (
          <div key={p.uid} className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-body">{p.name}</p>
                <p className="truncate text-sub text-ink-2">{p.email}</p>
              </div>
              {p.uid === me || p.role === 'owner' ? (
                <Pill tone="accent">{p.uid === me ? `${t.roles[p.role]} · ${t.people.you}` : t.roles[p.role]}</Pill>
              ) : (
                <Button variant="plain" onClick={() => setRemoving(p)}>
                  {t.people.remove}
                </Button>
              )}
            </div>
            {p.uid !== me && p.role !== 'owner' && (
              <Segmented
                label={`${t.people.role}: ${p.name}`}
                value={p.role as InvitableRole}
                options={roleOptions}
                onChange={(next) => void save([{ op: 'update', path: paths.user(p.uid), data: { role: next } }], t.people.saved)}
              />
            )}
          </div>
        ))}
      </Section>

      {invites.length > 0 && (
        <Section header={t.people.invited}>
          {invites.map((i) => (
            <Row
              key={i.email}
              title={`${i.name} · ${t.roles[i.role]}`}
              subtitle={i.email}
              value={
                <Button variant="plain" disabled={busy} onClick={() => void save([{ op: 'delete', path: paths.invite(i.email) }], t.people.saved)}>
                  {t.people.withdraw}
                </Button>
              }
            />
          ))}
        </Section>
      )}

      <Section header={t.people.add}>
        <div className="space-y-4 bg-canvas p-3">
          <Field label={t.people.name} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <Field
            label={t.people.email}
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <div>
            <p className="mb-1.5 px-1 text-sub text-ink-2">{t.people.role}</p>
            <Segmented label={t.people.role} value={role} options={roleOptions} onChange={setRole} />
          </div>
          {error && (
            <p role="alert" className="px-1 text-sub font-medium text-danger">
              {error}
            </p>
          )}
          <Button block disabled={busy || !name.trim() || !email.trim()} onClick={() => void onInvite()}>
            {t.people.invite}
          </Button>
        </div>
      </Section>

      {removing && (
        <FormSheet
          title={t.people.remove}
          saveLabel={t.people.remove}
          saveVariant="destructive"
          canSave={!busy}
          onClose={() => setRemoving(undefined)}
          onSave={() => {
            void save([{ op: 'delete', path: paths.user(removing.uid) }], t.people.saved).then(() => setRemoving(undefined))
          }}
        >
          <p className="text-body">{fill(t.people.removeConfirm, { name: removing.name })}</p>
        </FormSheet>
      )}
    </>
  )
}
