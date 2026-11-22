/**
 * Shows the app only to a signed-in person with a role (P4), or to anyone in demo mode (no Firebase settings).
 * While signed in, the demo data is used as the demo person with the same role, and business details come from
 * the cloud. Trips, customers and the ledger move to Firestore in P5.
 */
import { useEffect, type ReactNode } from 'react'
import { useSession } from '../firebase/session'
import { ActivationPage, LoadingScreen, NotAuthorisedPage, SignInPage, WaitingForOwnerPage } from '../pages/auth'
import { actAs, loadSettings } from '../store/commands'
import { currentUser } from '../store/selectors'
import { dispatch, useAppState } from '../store/store'

export function AuthGate({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const s = useAppState()
  const role = session.status === 'ready' ? session.user.role : undefined
  const settings = session.status === 'ready' ? session.settings : undefined
  const roleInStore = role === undefined || currentUser(s).role === role
  // Also after "Reset demo data", which puts back the demo's own role and settings.
  const settingsInStore = settings === undefined || s.settings === settings

  useEffect(() => {
    if (role && !roleInStore) dispatch(actAs(role))
  }, [role, roleInStore])
  useEffect(() => {
    if (settings && !settingsInStore) dispatch(loadSettings(settings))
  }, [settings, settingsInStore])

  switch (session.status) {
    case 'demo':
      return children
    case 'ready':
      return roleInStore ? children : <LoadingScreen />
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
