/**
 * Who is signed in and what they may do (P4). The steps a person goes through:
 *  demo             no Firebase settings: demo data and the role switch under More, as in P3
 *  loading          waiting for Firebase, or for the server to confirm the user's record
 *  signedOut        the sign-in screen
 *  notAuthorised    a Google account with no user record and no invite
 *  needsActivation  the owner's first sign-in: business details not saved yet (plan R01, U-03)
 *  waitingForOwner  a manager or driver who signed in before the owner finished set-up
 *  ready            signed in with a role and saved business details
 *
 * Access is decided by users/{uid} and the security rules, never by anything on this device.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import type { DocumentSnapshot } from 'firebase/firestore'
import { todayInKolkata, type BusinessSettings } from '../domain'
import { claimInviteWrites, normalizeEmail, paths, type DocWrite, type InviteDoc, type SettingsDoc, type UserDoc } from '../data/docs'
import type { FirebaseServices } from './client'
import { firebaseSettings } from './config'

export interface Account {
  uid: string
  email: string
  name: string
}

export type Session =
  | { status: 'demo' }
  | { status: 'loading'; account?: Account }
  | { status: 'signedOut'; error?: string }
  | { status: 'notAuthorised'; account: Account }
  | { status: 'needsActivation'; account: Account; user: UserDoc }
  | { status: 'waitingForOwner'; account: Account; user: UserDoc }
  | { status: 'ready'; account: Account; user: UserDoc; settings: BusinessSettings }

interface SessionApi {
  session: Session
  services?: FirebaseServices
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /** Looks again for the user record or an invite (after the owner adds someone). */
  checkAgain: () => void
  /** Saves documents as one batched write (resolves when the server has accepted them). */
  write: (writes: readonly DocWrite[]) => Promise<void>
}

const SessionContext = createContext<SessionApi | null>(null)

const errorCode = (err: unknown): string =>
  typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : 'unknown'

function accountOf(user: User): Account {
  const email = normalizeEmail(user.email ?? '')
  return { uid: user.uid, email, name: user.displayName ?? email }
}

function settingsOf(doc: SettingsDoc): BusinessSettings {
  const { updatedBy: _updatedBy, ...settings } = doc
  void _updatedBy
  return settings
}

/** Installed iPhone apps cannot return from a sign-in popup, so they sign in by redirect. */
function prefersRedirect(): boolean {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  return standalone || (navigator as { standalone?: boolean }).standalone === true
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(firebaseSettings ? { status: 'loading' } : { status: 'demo' })
  const [services, setServices] = useState<FirebaseServices>()
  const [attempt, setAttempt] = useState(0)
  const stops = useRef<(() => void)[]>([])

  useEffect(() => {
    const settings = firebaseSettings
    if (!settings) return
    let cancelled = false
    let stopAuth: (() => void) | undefined
    const stopWatching = () => {
      stops.current.forEach((stop) => stop())
      stops.current = []
    }

    void (async () => {
      const [{ connectFirebase, commitWrites }, authApi, store] = await Promise.all([
        import('./client'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ])
      if (cancelled) return
      const svc = connectFirebase(settings)
      setServices(svc)
      authApi.getRedirectResult(svc.auth).catch((err: unknown) => setSession({ status: 'signedOut', error: errorCode(err) }))

      const watchSettings = (account: Account, user: UserDoc) =>
        store.onSnapshot(
          store.doc(svc.db, paths.settings()),
          { includeMetadataChanges: true },
          (snap: DocumentSnapshot) => {
            if (snap.exists()) {
              setSession({ status: 'ready', account, user, settings: settingsOf(snap.data() as SettingsDoc) })
            } else if (!snap.metadata.fromCache) {
              setSession({ status: user.role === 'owner' ? 'needsActivation' : 'waitingForOwner', account, user })
            }
          },
          () => setSession({ status: 'waitingForOwner', account, user }),
        )

      /** No user record yet: use an invite for this email if the owner made one. */
      const tryInvite = async (account: Account): Promise<boolean> => {
        if (!account.email) return false
        try {
          const invite = await store.getDoc(store.doc(svc.db, paths.invite(account.email)))
          if (!invite.exists()) return false
          await commitWrites(svc.db, claimInviteWrites(account.uid, invite.data() as InviteDoc, todayInKolkata()))
          return true
        } catch {
          return false
        }
      }

      stopAuth = authApi.onAuthStateChanged(svc.auth, (firebaseUser) => {
        stopWatching()
        if (!firebaseUser) {
          setSession((s) => (s.status === 'signedOut' ? s : { status: 'signedOut' }))
          return
        }
        const account = accountOf(firebaseUser)
        setSession({ status: 'loading', account })
        void navigator.storage?.persist?.()
        let stopSettings: (() => void) | undefined
        const stopUser = store.onSnapshot(
          store.doc(svc.db, paths.user(account.uid)),
          { includeMetadataChanges: true },
          (snap: DocumentSnapshot) => {
            stopSettings?.()
            stopSettings = undefined
            if (snap.exists()) {
              stopSettings = watchSettings(account, snap.data() as UserDoc)
              return
            }
            // A missing record read from this phone's cache is not proof; wait for the server.
            if (snap.metadata.fromCache) return
            void tryInvite(account).then((claimed) => {
              if (!claimed && !cancelled) setSession({ status: 'notAuthorised', account })
            })
          },
          () => setSession({ status: 'notAuthorised', account }),
        )
        stops.current.push(stopUser, () => stopSettings?.())
      })
    })()

    return () => {
      cancelled = true
      stopAuth?.()
      stopWatching()
    }
  }, [attempt])

  const signIn = useCallback(async () => {
    if (!services) return
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import('firebase/auth')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      if (prefersRedirect() && !firebaseSettings?.useEmulators) await signInWithRedirect(services.auth, provider)
      else await signInWithPopup(services.auth, provider)
    } catch (err) {
      const code = errorCode(err)
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(services.auth, provider)
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setSession({ status: 'signedOut', error: code })
      }
    }
  }, [services])

  /**
   * Signs out and empties this phone's copy of the data, so the next person on a shared phone
   * cannot read what the last one could (cached documents are not re-checked by the rules).
   */
  const signOut = useCallback(async () => {
    if (!services) return
    const [{ signOut: firebaseSignOut }, { terminate, clearIndexedDbPersistence }] = await Promise.all([
      import('firebase/auth'),
      import('firebase/firestore'),
    ])
    await firebaseSignOut(services.auth)
    await terminate(services.db)
    await clearIndexedDbPersistence(services.db).catch(() => undefined)
    window.location.assign('/')
  }, [services])

  const checkAgain = useCallback(() => setAttempt((n) => n + 1), [])

  const write = useCallback(
    async (writes: readonly DocWrite[]) => {
      if (!services) throw new Error('Not connected to Firebase')
      const { commitWrites } = await import('./client')
      await commitWrites(services.db, writes)
    },
    [services],
  )

  const value = useMemo(
    () => ({ session, services, signIn, signOut, checkAgain, write }),
    [session, services, signIn, signOut, checkAgain, write],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionApi {
  const api = useContext(SessionContext)
  if (!api) throw new Error('useSession must be used inside SessionProvider')
  return api
}
