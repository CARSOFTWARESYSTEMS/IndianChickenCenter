/**
 * "Back up now" (P7): read every record, write the backup, upload it, download the same file again and check it,
 * then mark it verified on Drive. A backup counts as verified only after the copy on Drive passes (B-03, B-05).
 * Every step is passed in, so the tests run the whole sequence against a fake Drive.
 */
import { ok, type Result } from '../domain'
import { backupFileName, makeBackup, verifyCopy, type BackupCheck, type BackupData, type BackupFile } from './backup'
import type { DriveClient, DriveFile } from './drive'

export type BackupStep = 'reading' | 'connecting' | 'uploading' | 'checking' | 'done'

export interface BackupOutcome {
  backup: Pick<BackupFile, 'createdAt' | 'counts' | 'sha256'>
  file: DriveFile
  check: BackupCheck
  /** True only when the downloaded copy passed every check and Drive now marks it verified. */
  verified: boolean
}

export async function backUpToDrive(deps: {
  readEverything: () => Promise<Result<BackupData>>
  connect: () => Promise<Result<DriveClient>>
  meta: { createdBy: string; projectId: string }
  now?: () => Date
  onStep?: (step: BackupStep) => void
}): Promise<Result<BackupOutcome>> {
  const step = deps.onStep ?? (() => undefined)
  step('reading')
  const data = await deps.readEverything()
  if (!data.ok) return data
  const createdAt = (deps.now ?? (() => new Date()))().toISOString()
  const backup = await makeBackup(data.value, { ...deps.meta, createdAt })
  const text = JSON.stringify(backup)

  step('connecting')
  const drive = await deps.connect()
  if (!drive.ok) return drive

  step('uploading')
  const uploaded = await drive.value.upload(backupFileName(createdAt), text)
  if (!uploaded.ok) return uploaded

  step('checking')
  const copy = await drive.value.download(uploaded.value.id)
  if (!copy.ok) return copy
  const check = await verifyCopy(backup, copy.value)
  if (!check.ok) return check
  let file = uploaded.value
  if (check.value.ok) {
    const marked = await drive.value.markVerified(file.id)
    if (marked.ok) file = marked.value
  }
  step('done')
  const verified = check.value.ok && file.appProperties?.verified === 'yes'
  return ok({ backup: { createdAt, counts: backup.counts, sha256: backup.sha256 }, file, check: check.value, verified })
}
