/**
 * Asks Google for Drive access with the drive.file scope only (B-01): the owner signs in again in a pop-up and
 * Google lists just that permission. The token stays in memory for this visit, never in storage or a backup.
 */
import { GoogleAuthProvider, reauthenticateWithPopup, type Auth } from 'firebase/auth'
import { fail, ok, type Result } from '../domain'
import { DRIVE_SCOPE, driveClient, type DriveClient } from './drive'

export function driveSignInProvider(email?: string): GoogleAuthProvider {
  const provider = new GoogleAuthProvider()
  provider.addScope(DRIVE_SCOPE)
  if (email) provider.setCustomParameters({ login_hint: email })
  return provider
}

let held: { token: string; until: number } | undefined

export async function connectDrive(auth: Auth): Promise<Result<DriveClient>> {
  if (held && held.until > Date.now()) return ok(driveClient(held.token))
  const user = auth.currentUser
  if (!user) return fail('not_permitted', 'Sign in first')
  try {
    const result = await reauthenticateWithPopup(user, driveSignInProvider(user.email ?? undefined))
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken
    if (!token) return fail('not_permitted', 'Google did not give access to Drive')
    held = { token, until: Date.now() + 50 * 60_000 } // Google's tokens last about an hour
    return ok(driveClient(token))
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : ''
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return fail('not_permitted', 'Drive access was not given')
    if (code === 'auth/popup-blocked') return fail('not_permitted', 'The browser blocked the Google window. Allow pop-ups and try again.')
    if (code === 'auth/network-request-failed') return fail('not_online', 'Connect to the internet to reach Google Drive')
    return fail('not_permitted', code || 'Could not connect to Google Drive')
  }
}

export function forgetDrive(): void {
  held = undefined
}
