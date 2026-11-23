/**
 * Shows the app only to a signed-in person with a role (P4), or to anyone in demo mode (no Firebase settings).
 * Once signed in, it starts the cloud store (P5): the same commands then read and save in Firestore.
 */
import { useEffect, type ReactNode } from 'react'
import { firebaseSettings } from '../firebase/config'
import { keepStorage } from './device'
import { useSession } from '../firebase/session'
import { ActivationPage, LoadingScreen, NotAuthorisedPage, SignInPage, WaitingForOwnerPage } from '../pages/auth'
import { useSync } from '../store/sync'

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, services } = useSession()
  const sync = useSync()
  const uid = session.status === 'ready' ? session.account.uid : undefined
  const role = session.status === 'ready' ? session.user.role : undefined

  // DV-06: entries wait on the phone until the cloud has them, so ask the browser once to keep this app's data.
  const usable = session.status === 'ready' || session.status === 'demo'
  useEffect(() => {
    if (usable) void keepStorage()
  }, [usable])

  useEffect(() => {
    if (!uid || !role || !services) return
    let stop: (() => void) | undefined
    let cancelled = false
    void Promise.all([import('../store/cloud'), import('firebase/firestore')]).then(([{ startCloud }, store]) => {
      if (cancelled) return
      const cloud = startCloud({ db: services.db, uid, role })
      stop = () => cloud.stop()
      // Local emulators only: lets a developer cut this tab's Firestore connection to try offline saving.
      if (firebaseSettings?.useEmulators) {
        Object.assign(window, {
          iccNetwork: { off: () => store.disableNetwork(services.db), on: () => store.enableNetwork(services.db) },
        })
      }
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [uid, role, services])

  switch (session.status) {
    case 'demo':
      return children
    case 'ready':
      return sync.ready ? children : <LoadingScreen />
    case 'loading':
      return <LoadingScreen />
    case 'signedOut':
      return <SignInPage error={session.error} />
    case 'notAuthorised':
      return <NotAuthorisedPage account={session.account} />
    case 'needsActivation':
      return <ActivationPage account={session.account} />
    case 'waitingForOwner':
      return <WaitingForOwnerPage />
  }
}
