/**
 * Firebase services, created once. Loaded with a dynamic import, so demo mode never downloads Firebase.
 *  - Auth keeps the sign-in in IndexedDB, so the app opens signed in and offline.
 *  - Firestore uses its built-in persistent offline cache (plan v2 §H): no hand-built sync.
 */
import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { DocWrite } from '../data/docs'
import type { FirebaseSettings } from './config'

export interface FirebaseServices {
  auth: Auth
  db: Firestore
}

let services: FirebaseServices | undefined

export function connectFirebase(settings: FirebaseSettings): FirebaseServices {
  if (services) return services
  const app = initializeApp({
    apiKey: settings.apiKey,
    authDomain: settings.authDomain,
    projectId: settings.projectId,
    appId: settings.appId,
  })
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  })
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
  if (settings.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  services = { auth, db }
  return services
}

/**
 * Saves DocWrites as one batched write. Batches queue while offline (transactions would not), and the
 * rules check each document against the others in the same batch.
 */
export function commitWrites(db: Firestore, writes: readonly DocWrite[]): Promise<void> {
  const batch = writeBatch(db)
  for (const w of writes) {
    const ref = doc(db, w.path)
    if (w.op === 'set') batch.set(ref, w.data)
    else if (w.op === 'update') batch.update(ref, w.data)
    else batch.delete(ref)
  }
  return batch.commit()
}
