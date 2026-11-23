import { describe, expect, it } from 'vitest'
import { deployProblems, servingDomains } from '../deployCheck'

const ready = {
  VITE_FIREBASE_API_KEY: 'AIzaSyTestOnlyNotARealKey000000000000',
  VITE_FIREBASE_AUTH_DOMAIN: 'icc-ujire.web.app',
  VITE_FIREBASE_PROJECT_ID: 'icc-ujire',
  VITE_FIREBASE_APP_ID: '1:123456789:web:abcdef',
}

describe('Deploy settings (P9)', () => {
  it('DEP-01 complete settings for the named project, signed in on its own domain, are ready', () => {
    expect(deployProblems(ready, { project: 'icc-ujire' })).toEqual([])
    expect(deployProblems({ ...ready, VITE_FIREBASE_AUTH_DOMAIN: 'icc-ujire.firebaseapp.com' }, { project: 'icc-ujire' })).toEqual([])
  })

  it('DEP-02 missing settings or emulators are refused: the hosted app must never run on demo data', () => {
    const { VITE_FIREBASE_APP_ID: _, ...noApp } = ready
    expect(deployProblems(noApp, { project: 'icc-ujire' })).toHaveLength(1)
    expect(deployProblems({}, { project: 'icc-ujire' })[0]).toContain('VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID')
    expect(deployProblems({ ...ready, VITE_FIREBASE_EMULATORS: '1' }, { project: 'icc-ujire' })).toHaveLength(1)
  })

  it('DEP-03 the auth domain must be the serving domain (trap 2), and the project must match', () => {
    expect(deployProblems({ ...ready, VITE_FIREBASE_AUTH_DOMAIN: 'localhost' }, { project: 'icc-ujire' })).toHaveLength(1)
    expect(deployProblems({ ...ready, VITE_FIREBASE_AUTH_DOMAIN: 'other.web.app' }, { project: 'icc-ujire' })).toHaveLength(1)
    expect(deployProblems(ready, { project: 'icc-other' })).toHaveLength(2)
    expect(deployProblems(ready, { project: 'demo-icc' }).length).toBeGreaterThan(0)
  })

  it('DEP-04 a custom domain is allowed when the deploy names it, and is where the smoke test looks first', () => {
    const custom = { ...ready, VITE_FIREBASE_AUTH_DOMAIN: 'app.indianchicken.in' }
    expect(deployProblems(custom, { project: 'icc-ujire' })).toHaveLength(1)
    expect(deployProblems(custom, { project: 'icc-ujire', domain: 'app.indianchicken.in' })).toEqual([])
    expect(servingDomains({ project: 'icc-ujire', domain: 'App.IndianChicken.in' })).toEqual([
      'app.indianchicken.in',
      'icc-ujire.web.app',
      'icc-ujire.firebaseapp.com',
    ])
  })
})
