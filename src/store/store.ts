/**
 * The demo store: one state object, saved on this device so a demo survives the phone closing the browser.
 * Screens only call dispatch(command) and read useAppState(); P5 replaces this file with Firestore repositories
 * behind the same commands.
 */
import { useSyncExternalStore } from 'react'
import { ok, type Result } from '../domain'
import { seedDemoState, type AppState } from './state'

const STORAGE_KEY = 'icc.demo.v1'

function load(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    return parsed?.version === 1 ? parsed : null
  } catch {
    return null
  }
}

function save(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable: the demo keeps working for this visit.
  }
}

let state: AppState = load() ?? seedDemoState()
const listeners = new Set<() => void>()

function commit(next: AppState): void {
  state = next
  save(next)
  listeners.forEach((l) => l())
}

export function getState(): AppState {
  return state
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

export interface Next<T> {
  state: AppState
  value: T
}

/** Runs a command against the current state; only a successful command changes anything. */
export function dispatch<T>(command: (s: AppState) => Result<Next<T>>): Result<T> {
  const result = command(state)
  if (!result.ok) return result
  commit(result.value.state)
  return ok(result.value.value)
}

export function resetDemo(): void {
  commit(seedDemoState())
}
