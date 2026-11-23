/**
 * P9: the production build's Firebase settings, checked before every deploy (scripts/deploy.sh). Pure TypeScript.
 *
 * The rules that matter:
 *  - every setting is present, so the hosted app never falls back to demo mode;
 *  - the emulators are off;
 *  - the settings name the project being deployed to;
 *  - the auth domain is the domain that serves the app (plan trap 2, D-02). Google sign-in on iPhones and in
 *    installed apps depends on it.
 */
export interface DeployTarget {
  project: string
  /** A custom domain added to Firebase Hosting, when the app is served from it instead of <project>.web.app. */
  domain?: string
}

const KEYS = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const

/** The domains the app may be served from, the first being where the smoke test looks. */
export function servingDomains(target: DeployTarget): string[] {
  const own = [`${target.project}.web.app`, `${target.project}.firebaseapp.com`]
  return target.domain ? [target.domain.toLowerCase(), ...own] : own
}

/** What is wrong with these settings for this deploy, in plain words (empty when ready). */
export function deployProblems(env: Record<string, string | undefined>, target: DeployTarget): string[] {
  const problems: string[] = []
  const get = (key: string) => (env[key] ?? '').trim()

  if (!/^[a-z0-9-]{6,30}$/.test(target.project)) problems.push(`"${target.project}" is not a Firebase project ID.`)
  if (target.project.startsWith('demo-')) problems.push('demo- projects exist only in the emulators; name the real project.')

  const missing = KEYS.filter((k) => !get(k))
  if (missing.length) problems.push(`Missing in .env.production.local: ${missing.join(', ')}. Without them the hosted app would run on demo data.`)

  if (get('VITE_FIREBASE_EMULATORS')) problems.push('VITE_FIREBASE_EMULATORS is set: the hosted app would look for emulators on the phone.')

  const projectId = get('VITE_FIREBASE_PROJECT_ID')
  if (projectId && projectId !== target.project) problems.push(`The settings are for "${projectId}", but the deploy is to "${target.project}".`)

  const authDomain = get('VITE_FIREBASE_AUTH_DOMAIN').toLowerCase()
  const domains = servingDomains(target)
  if (authDomain && !domains.includes(authDomain)) {
    problems.push(`VITE_FIREBASE_AUTH_DOMAIN is "${authDomain}". It must be the domain that serves the app (${domains.join(' or ')}), or sign-in fails on iPhones.`)
  }

  const apiKey = get('VITE_FIREBASE_API_KEY')
  if (apiKey && !apiKey.startsWith('AIza')) problems.push('VITE_FIREBASE_API_KEY does not look like a Firebase web API key (they start with "AIza").')

  return problems
}
