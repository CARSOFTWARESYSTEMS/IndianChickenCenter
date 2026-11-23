/**
 * P9 production smoke test: checks the hosted app from the outside, the way a phone first meets it.
 *   npm run smoke -- https://<project>.web.app --project <id>
 *   npm run smoke -- http://127.0.0.1:5002 --local      (the Firebase Hosting emulator: hosting checks only)
 * Read-only: it fetches pages and makes one unauthenticated Firestore read that must be refused.
 */

const argv = process.argv.slice(2)
const base = argv.find((a) => /^https?:\/\//.test(a))?.replace(/\/$/, '')
const flag = (name: string) => argv.includes(`--${name}`)
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const local = flag('local')
const project = value('project')

if (!base || (!local && !project)) {
  console.error('Usage: npm run smoke -- <app url> --project <id>   |   npm run smoke -- <emulator url> --local')
  process.exit(2)
}

type Check = { id: string; what: string; run: () => Promise<string | true> }
const results: { id: string; what: string; ok: boolean; note: string }[] = []

const get = (path: string, init?: RequestInit) => fetch(`${base}${path}`, { redirect: 'manual', ...init })
const header = (res: Response, key: string) => res.headers.get(key) ?? ''

let entryScript = ''

const checks: Check[] = [
  {
    id: 'SM-01',
    what: 'The app page loads',
    run: async () => {
      const res = await get('/')
      const html = await res.text()
      entryScript = /<script[^>]+src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1] ?? ''
      if (res.status !== 200) return `status ${res.status}`
      if (!html.includes('id="root"')) return 'no root element'
      return entryScript ? true : 'no entry script in the page'
    },
  },
  {
    id: 'SM-02',
    what: 'A deep link opens the app (rewrite to index.html)',
    run: async () => {
      const res = await get('/customers/some-id/bills/some-bill')
      const html = await res.text()
      return res.status === 200 && html.includes('id="root"') ? true : `status ${res.status}`
    },
  },
  {
    id: 'SM-03',
    what: 'The service worker and the page are re-checked on every visit (updates reach phones)',
    run: async () => {
      for (const path of ['/sw.js', '/index.html', '/manifest.webmanifest']) {
        const res = await get(path)
        await res.arrayBuffer()
        if (res.status !== 200) return `${path}: status ${res.status}`
        if (!header(res, 'cache-control').includes('no-cache')) return `${path}: Cache-Control "${header(res, 'cache-control')}"`
      }
      return true
    },
  },
  {
    id: 'SM-03b',
    what: "The service worker leaves Firebase's /__/ pages (Google sign-in) to Firebase",
    run: async () => {
      const sw = await (await get('/sw.js')).text()
      return sw.includes('denylist:[/^\\/__\\//]') ? true : 'sw.js answers /__/auth/handler with the app: sign-in would loop'
    },
  },
  {
    id: 'SM-04',
    what: 'Fingerprinted files are cached for a year',
    run: async () => {
      if (!entryScript) return 'no entry script (SM-01 failed)'
      const res = await get(entryScript)
      await res.arrayBuffer()
      const cache = header(res, 'cache-control')
      return res.status === 200 && cache.includes('immutable') && cache.includes('max-age=31536000') ? true : `status ${res.status}, Cache-Control "${cache}"`
    },
  },
  {
    id: 'SM-05',
    what: 'The install manifest is served as a manifest',
    run: async () => {
      const res = await get('/manifest.webmanifest')
      const type = header(res, 'content-type')
      const m = (await res.json().catch(() => null)) as { display?: string; start_url?: string; icons?: unknown[] } | null
      if (!m) return `not JSON (Content-Type "${type}")`
      if (m.display !== 'standalone') return `display "${m.display}"`
      return (m.icons?.length ?? 0) >= 2 && m.start_url ? true : 'icons or start_url missing'
    },
  },
  {
    id: 'SM-06',
    what: 'Security headers are set',
    run: async () => {
      const res = await get('/')
      await res.arrayBuffer()
      const missing = ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'].filter((h) => !res.headers.has(h))
      return missing.length ? `missing ${missing.join(', ')}` : true
    },
  },
]

if (!local) {
  const host = new URL(base).host
  checks.push(
    {
      id: 'SM-07',
      what: `The built app signs in through ${host} itself (auth domain = serving domain)`,
      run: async () => {
        if (!entryScript) return 'no entry script (SM-01 failed)'
        const js = await (await get(entryScript)).text()
        // The bundler may write the value in "", '' or `` quotes.
        const setting = (key: string, value: string) => new RegExp(`${key}:["'\`]${value.replace(/[.]/g, '\\.')}["'\`]`).test(js)
        if (setting('VITE_FIREBASE_EMULATORS', '1')) return 'built for the emulators'
        return setting('VITE_FIREBASE_AUTH_DOMAIN', host) ? true : `the bundle does not name ${host} as its auth domain`
      },
    },
    {
      id: 'SM-08',
      what: 'Firebase sign-in helper is served on this domain',
      run: async () => {
        const res = await get('/__/auth/handler')
        await res.arrayBuffer()
        return res.status === 200 ? true : `status ${res.status}`
      },
    },
    {
      id: 'SM-09',
      what: `Hosting belongs to ${project}`,
      run: async () => {
        const res = await get('/__/firebase/init.json')
        const init = (await res.json().catch(() => null)) as { projectId?: string } | null
        return init?.projectId === project ? true : `init.json names "${init?.projectId ?? res.status}"`
      },
    },
    {
      id: 'SM-10',
      what: 'The live database refuses a reader who is not signed in (S-01)',
      run: async () => {
        const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/customers?pageSize=1`
        const res = await fetch(url)
        const body = await res.text()
        if (res.status === 403) return true
        if (res.status === 404) return 'no Firestore database in this project yet'
        return `status ${res.status}: ${body.slice(0, 120)}`
      },
    },
  )
}

async function main(): Promise<void> {
  for (const c of checks) {
    let outcome: string | true
    try {
      outcome = await c.run()
    } catch (err) {
      outcome = err instanceof Error ? err.message : String(err)
    }
    results.push({ id: c.id, what: c.what, ok: outcome === true, note: outcome === true ? '' : outcome })
  }
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.id} ${r.what}${r.note ? ` — ${r.note}` : ''}`)
  const failed = results.filter((r) => !r.ok).length
  console.log(failed ? `\n${failed} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed on ${base}.`)
  process.exit(failed ? 1 : 0)
}

void main()
