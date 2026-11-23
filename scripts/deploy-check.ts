/**
 * P9: checks the production settings before a deploy (run by scripts/deploy.sh).
 *   npx jiti scripts/deploy-check.ts --project <id> [--domain <custom domain>]
 * Reads the same files `vite build` reads in production mode (.env, .env.local, .env.production,
 * .env.production.local). Prints the problems and exits 1 if the build would not be fit to deploy.
 */
import { loadEnv } from 'vite'
import { deployProblems } from '../src/firebase/deployCheck'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

const project = arg('project')
if (!project) {
  console.error('Usage: npx jiti scripts/deploy-check.ts --project <id> [--domain <custom domain>]')
  process.exit(2)
}
const domain = arg('domain')
const env = loadEnv('production', process.cwd(), 'VITE_')
const problems = deployProblems(env, domain ? { project, domain } : { project })

if (problems.length) {
  console.error('✗ Not ready to deploy:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`✓ Settings are for ${project}; sign-in domain ${env.VITE_FIREBASE_AUTH_DOMAIN}.`)
