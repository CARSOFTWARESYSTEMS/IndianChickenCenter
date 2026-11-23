/**
 * Firebase settings come from .env.local (see .env.example) or .env.emulators. Without them the app runs on
 * demo data only, exactly as in P3.
 */
export interface FirebaseSettings {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  /** Use the local Auth and Firestore emulators (npm run emulators). */
  useEmulators: boolean
}

export function readFirebaseSettings(env: Record<string, string | boolean | undefined> = import.meta.env): FirebaseSettings | null {
  const get = (key: string): string => {
    const v = env[key]
    return typeof v === 'string' ? v.trim() : ''
  }
  const settings: FirebaseSettings = {
    apiKey: get('VITE_FIREBASE_API_KEY'),
    authDomain: get('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: get('VITE_FIREBASE_PROJECT_ID'),
    appId: get('VITE_FIREBASE_APP_ID'),
    useEmulators: get('VITE_FIREBASE_EMULATORS') === '1',
  }
  return settings.apiKey && settings.projectId && settings.authDomain ? settings : null
}

export const firebaseSettings = readFirebaseSettings()
