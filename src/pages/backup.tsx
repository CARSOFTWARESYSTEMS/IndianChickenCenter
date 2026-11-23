/**
 * Backup to Google Drive (P7, owner only). "Back up now" reads every record, saves the file to Drive, reads the copy
 * back and checks it; only then is it marked Verified (B-03, B-05). A backup can also be saved on the device, and
 * any backup file can be checked and compared with the cloud (the restore preview, B-06). Restoring missing records
 * is done with the restore tool on a computer (decision D-29). Loaded on demand.
 */
import { useRef, useState } from 'react'
import { useT } from '../app/preferences'
import { useToast } from '../app/toast'
import { errorText, fill } from '../i18n/labels'
import { formatIndianDate, formatRupees, todayInKolkata, type DomainError } from '../domain'
import { backupFileName, checkBackup, makeBackup, planRestore, type BackupCheck, type BackupData, type BackupFile } from '../backup/backup'
import { readEverything } from '../backup/collect'
import { connectDrive } from '../backup/connect'
import type { DriveFile } from '../backup/drive'
import { backUpToDrive, type BackupStep } from '../backup/flow'
import { firebaseSettings } from '../firebase/config'
import { useSession } from '../firebase/session'
import { Button } from '../ui/Button'
import { Card, EmptyState, PageHeader, Pill, Row, Section } from '../ui/primitives'

const LAST_KEY = 'icc.lastBackup'

interface LastBackup {
  at: string
  name: string
  verified: boolean
  records: number
}

function readLast(): LastBackup | undefined {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

function writeLast(last: LastBackup): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(last))
  } catch {
    // Storage unavailable: the date simply is not remembered on this phone.
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const recordsIn = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0)

interface Checked {
  source: string
  /** The copy was read back from Drive (otherwise: a file from this device). */
  fromDrive: boolean
  check: BackupCheck
  data: BackupData
}

export default function BackupPage() {
  const t = useT()
  const toast = useToast()
  const { session, services } = useSession()
  const [step, setStep] = useState<BackupStep>()
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<LastBackup | undefined>(readLast)
  const [onDrive, setOnDrive] = useState<DriveFile[]>()
  const [checked, setChecked] = useState<Checked>()
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const owner = session.status === 'ready' && session.user.role === 'owner' ? session : undefined
  if (!owner || !services) {
    return (
      <>
        <PageHeader title={t.more.backup} back={{ to: '/more', label: t.more.back }} />
        <Card className="mt-2">
          <EmptyState icon="backup" message={session.status === 'demo' ? t.backup.cloudOnly : t.backup.ownerOnly} />
        </Card>
      </>
    )
  }

  const meta = { createdBy: owner.account.uid, projectId: firebaseSettings?.projectId ?? '' }
  const problem = (e: DomainError) => setError(fill(t.backup.failed, { reason: e.code === 'invalid_input' || e.code === 'not_saved' || e.code === 'not_permitted' ? e.message : errorText(t, e) }))

  const backUp = async () => {
    setError(undefined)
    setChecked(undefined)
    const outcome = await backUpToDrive({
      readEverything: () => readEverything(services.db),
      connect: () => connectDrive(services.auth),
      meta,
      onStep: setStep,
    })
    setStep(undefined)
    if (!outcome.ok) return problem(outcome.error)
    const o = outcome.value
    const next = { at: o.backup.createdAt, name: o.file.name, verified: o.verified, records: recordsIn(o.backup.counts) }
    writeLast(next)
    setLast(next)
    setChecked({ source: o.file.name, fromDrive: true, check: o.check, data: {} })
    if (o.verified) toast(t.backup.verified)
  }

  const showDrive = async () => {
    setError(undefined)
    setBusy(true)
    const drive = await connectDrive(services.auth)
    const files = drive.ok ? await drive.value.list() : drive
    setBusy(false)
    if (!files.ok) return problem(files.error)
    setOnDrive(files.value)
  }

  const checkText = async (source: string, text: string, fromDrive: boolean) => {
    const check = await checkBackup(text)
    if (!check.ok) return problem(check.error)
    setChecked({ source, fromDrive, check: check.value, data: (JSON.parse(text) as BackupFile).data })
  }

  const checkOnDrive = async (file: DriveFile) => {
    setError(undefined)
    setBusy(true)
    const drive = await connectDrive(services.auth)
    const text = drive.ok ? await drive.value.download(file.id) : drive
    setBusy(false)
    if (!text.ok) return problem(text.error)
    await checkText(file.name, text.value, true)
  }

  const saveCopy = async () => {
    setError(undefined)
    setBusy(true)
    const data = await readEverything(services.db)
    setBusy(false)
    if (!data.ok) return problem(data.error)
    const file = await makeBackup(data.value, { ...meta, createdAt: new Date().toISOString() })
    download(backupFileName(file.createdAt), JSON.stringify(file))
  }

  const working = step !== undefined || busy

  return (
    <>
      <PageHeader title={t.more.backup} subtitle={t.backup.intro} back={{ to: '/more', label: t.more.back }} />

      <Section footer={last ? fill(t.backup.lastBackup, { date: formatIndianDate(todayInKolkata(new Date(last.at))) }) : t.backup.never}>
        <div className="space-y-3 p-3">
          {last && (
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="min-w-0 truncate text-sub">{last.name}</span>
              <Pill tone={last.verified ? 'received' : 'danger'}>{last.verified ? t.backup.verified : t.backup.notVerified}</Pill>
            </div>
          )}
          <Button block disabled={working} onClick={() => void backUp()}>
            {step ? t.backup.steps[step] : t.backup.backUpNow}
          </Button>
          {error && (
            <p role="alert" className="px-1 text-sub font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Section>

      {checked && (
        <CheckResult key={`${checked.source}-${checked.check.file.sha256}`} checked={checked} onCompare={() => readEverything(services.db)} />
      )}

      <Section header={t.backup.onDrive}>
        {onDrive === undefined ? (
          <Row title={t.backup.showDrive} icon="backup" onClick={() => void showDrive()} />
        ) : onDrive.length === 0 ? (
          <p className="px-4 py-3 text-sub text-ink-2">{t.backup.noneOnDrive}</p>
        ) : (
          onDrive.map((f) => (
            <Row
              key={f.id}
              title={f.name}
              subtitle={f.appProperties?.verified === 'yes' ? t.backup.verified : t.backup.notVerified}
              value={t.backup.check}
              onClick={() => void checkOnDrive(f)}
            />
          ))
        )}
      </Section>

      <Section header={t.backup.other}>
        <Row title={t.backup.saveCopy} icon="install" onClick={() => void saveCopy()} />
        <Row title={t.backup.checkFile} icon="check" onClick={() => fileInput.current?.click()} />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void file.text().then((text) => checkText(file.name, text, false))
          }}
        />
      </Section>
    </>
  )
}

function CheckResult({ checked, onCompare }: { checked: Checked; onCompare: () => Promise<{ ok: true; value: BackupData } | { ok: false; error: DomainError }> }) {
  const t = useT()
  const [comparing, setComparing] = useState(false)
  const [plan, setPlan] = useState<ReturnType<typeof planRestore>>()
  const [error, setError] = useState<string>()
  const { check, data } = checked
  const names = (ids: string[]) => ids.map((id) => String(data[`customers/${id}`]?.shopName ?? id)).join(', ')
  const toCollect = Object.values(check.balances).reduce((sum, b) => sum + Math.max(0, b), 0)
  const canCompare = Object.keys(data).length > 0

  const compare = async () => {
    setComparing(true)
    setError(undefined)
    const live = await onCompare()
    setComparing(false)
    if (!live.ok) return setError(errorText(t, live.error))
    setPlan(planRestore(data, live.value))
  }

  return (
    <Section header={t.backup.result} footer={plan && plan.missing.length > 0 ? t.backup.restoreNote : undefined}>
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-body font-semibold">{checked.source}</p>
          <Pill tone={check.ok ? 'received' : 'danger'}>{check.ok ? t.backup.verified : t.backup.notVerified}</Pill>
        </div>
        <p className="text-sub text-ink-2">
          {fill(t.backup.records, { count: check.documents })} · {t.backup.toCollect} <span className="num">{formatRupees(toCollect)}</span>
        </p>
        {check.ok ? (
          <p className="text-sub text-received">{checked.fromDrive ? fill(t.backup.verifiedNote, { count: check.documents }) : t.backup.checksumOk}</p>
        ) : (
          <>
            <p className="text-sub font-semibold text-danger">{t.backup.problems}</p>
            <ul className="list-disc space-y-1 pl-5 text-sub text-danger">
              {check.problems.slice(0, 8).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        )}
        {check.snapshotMismatches.length > 0 && <p className="text-sub text-due">{fill(t.backup.snapshotMismatch, { names: names(check.snapshotMismatches) })}</p>}
        {plan && (
          <div className="space-y-1 pt-1 text-sub">
            {plan.missing.length === 0 ? <p className="text-received">{t.backup.allPresent}</p> : <p className="text-due">{fill(t.backup.missing, { count: plan.missing.length })}</p>}
            {plan.different.length > 0 && <p className="text-ink-2">{fill(t.backup.different, { count: plan.different.length })}</p>}
          </div>
        )}
        {error && <p className="text-sub text-danger">{error}</p>}
        {canCompare && !plan && (
          <Button variant="secondary" block disabled={comparing} onClick={() => void compare()}>
            {comparing ? t.backup.comparing : t.backup.compare}
          </Button>
        )}
      </div>
    </Section>
  )
}
