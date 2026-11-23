/**
 * Google Drive for backups (P7). Only the drive.file scope: the app sees the files it created, nothing else in the
 * owner's Drive (plan v1 trap 4, B-01). A browser sign-in token lasts about an hour and is never stored or written
 * into a backup, so backups are made when the owner taps "Back up now" (no unattended backups).
 *
 * A plain REST client: `fetch` is passed in, so the tests can stand in a fake Drive.
 */
import { fail, ok, type Result } from '../domain'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FIELDS = 'id,name,createdTime,appProperties'

export interface DriveFile {
  id: string
  name: string
  createdTime?: string
  /** icc=backup marks the app's backups; verified=yes once the copy on Drive has been checked (B-05). */
  appProperties?: Record<string, string>
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface DriveClient {
  upload(name: string, text: string): Promise<Result<DriveFile>>
  download(id: string): Promise<Result<string>>
  list(): Promise<Result<DriveFile[]>>
  markVerified(id: string): Promise<Result<DriveFile>>
}

async function failed(res: Response, what: string): Promise<Result<never>> {
  const detail = await res.text().catch(() => '')
  if (res.status === 401 || res.status === 403) return fail('not_permitted', `Google Drive refused ${what} (${res.status}). Connect again.`)
  return fail('not_saved', `Google Drive could not ${what} (${res.status}) ${detail.slice(0, 120)}`)
}

export function driveClient(token: string, fetchImpl: Fetch = (input, init) => fetch(input, init)): DriveClient {
  const auth = { Authorization: `Bearer ${token}` }
  const call = async (url: string, init: RequestInit = {}): Promise<Response | undefined> => {
    try {
      return await fetchImpl(url, { ...init, headers: { ...auth, ...(init.headers ?? {}) } })
    } catch {
      return undefined
    }
  }
  const offline = fail('not_online', 'Connect to the internet to reach Google Drive')

  return {
    async upload(name, text) {
      const boundary = `icc-${Math.random().toString(36).slice(2)}`
      const metadata = { name, mimeType: 'application/json', appProperties: { icc: 'backup' } }
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`
      const res = await call(`${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      })
      if (!res) return offline
      return res.ok ? ok((await res.json()) as DriveFile) : failed(res, 'save the backup')
    },
    async download(id) {
      const res = await call(`${API}/${encodeURIComponent(id)}?alt=media`)
      if (!res) return offline
      return res.ok ? ok(await res.text()) : failed(res, 'read the backup')
    },
    async list() {
      const q = encodeURIComponent("appProperties has { key='icc' and value='backup' } and trashed=false")
      const res = await call(`${API}?q=${q}&orderBy=createdTime%20desc&pageSize=50&fields=files(${FIELDS})`)
      if (!res) return offline
      return res.ok ? ok(((await res.json()) as { files?: DriveFile[] }).files ?? []) : failed(res, 'list the backups')
    },
    async markVerified(id) {
      const res = await call(`${API}/${encodeURIComponent(id)}?fields=${FIELDS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appProperties: { verified: 'yes' } }),
      })
      if (!res) return offline
      return res.ok ? ok((await res.json()) as DriveFile) : failed(res, 'mark the backup as checked')
    },
  }
}
