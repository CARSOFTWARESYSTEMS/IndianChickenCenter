/** An in-memory Google Drive that answers the requests drive.ts makes, for the backup tests. */
import type { Fetch } from '../drive'

interface Stored {
  id: string
  name: string
  createdTime: string
  appProperties: Record<string, string>
  content: string
}

export function fakeDrive(options: { token?: string; corrupt?: (text: string) => string } = {}) {
  const files = new Map<string, Stored>()
  let next = 1
  const token = options.token ?? 'test-token'
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const meta = ({ content: _c, ...rest }: Stored) => (void _c, rest)

  const fetchImpl: Fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers)
    if (headers.get('Authorization') !== `Bearer ${token}`) return json({ error: 'unauthenticated' }, 401)
    const url = new URL(input)
    const method = init.method ?? 'GET'
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      const boundary = /boundary=([^;]+)/.exec(headers.get('Content-Type') ?? '')?.[1] ?? ''
      const parts = String(init.body).split(`--${boundary}`).slice(1, 3)
      const body = (part: string) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')
      const metadata = JSON.parse(body(parts[0] ?? '{}')) as { name: string; appProperties?: Record<string, string> }
      const stored: Stored = {
        id: `file-${next++}`,
        name: metadata.name,
        createdTime: '2026-11-23T03:45:00.000Z',
        appProperties: metadata.appProperties ?? {},
        content: body(parts[1] ?? ''),
      }
      files.set(stored.id, stored)
      return json(meta(stored))
    }
    const id = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)?.[1]
    if (id && method === 'GET' && url.searchParams.get('alt') === 'media') {
      const f = files.get(decodeURIComponent(id))
      if (!f) return json({ error: 'not found' }, 404)
      return new Response(options.corrupt ? options.corrupt(f.content) : f.content, { status: 200 })
    }
    if (id && method === 'PATCH') {
      const f = files.get(decodeURIComponent(id))
      if (!f) return json({ error: 'not found' }, 404)
      const patch = JSON.parse(String(init.body)) as { appProperties?: Record<string, string> }
      f.appProperties = { ...f.appProperties, ...patch.appProperties }
      return json(meta(f))
    }
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const list = [...files.values()].filter((f) => f.appProperties.icc === 'backup').map(meta)
      return json({ files: list.reverse() })
    }
    return json({ error: `unexpected ${method} ${url.pathname}` }, 400)
  }
  return { fetch: fetchImpl, files }
}
