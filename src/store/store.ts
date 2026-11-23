/**
 * The app's one store. Screens only call dispatch(command) and read useAppState().
 *  - Demo mode: one state object, saved on this device (P3).
 *  - Signed in (P5): the cloud store (cloud.ts) attaches itself; the same commands then save to Firestore.
 */
import { useSyncExternalStore } from 'react'
import { ok, type IssuedBill, type Result } from '../domain'
import { issueBillCommand, type IssueBillInput } from './commands'
import { seedDemoState, type AppState } from './state'

const STORAGE_KEY = 'icc.demo.v1'

function load(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    // Demo data saved before bills existed (P6) has no bills yet.
    return parsed?.version === 1 ? { ...parsed, bills: parsed.bills ?? [] } : null
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

export interface Next<T> {
  state: AppState
  value: T
}

export type Command<T> = (s: AppState) => Result<Next<T>>

/** A store that keeps AppState somewhere other than this device's demo copy. */
export interface Backend {
  getState(): AppState
  dispatch<T>(command: Command<T>): Result<T>
  /** Gives the bill its number and stores it (the cloud does this online, in a transaction). */
  issueBill(input: IssueBillInput): Promise<Result<IssuedBill>>
}

let demo: AppState | undefined
let backend: Backend | undefined
const listeners = new Set<() => void>()

function demoState(): AppState {
  demo ??= load() ?? seedDemoState()
  return demo
}

/** Called by a backend whenever its state changes. */
export function storeChanged(): void {
  listeners.forEach((l) => l())
}

export function attachBackend(next: Backend | undefined): void {
  backend = next
  storeChanged()
}

export function getState(): AppState {
  return backend ? backend.getState() : demoState()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

/** Runs a command against the current state; only a successful command changes anything. */
export function dispatch<T>(command: Command<T>): Result<T> {
  if (backend) return backend.dispatch(command)
  const result = command(demoState())
  if (!result.ok) return result
  demo = result.value.state
  save(demo)
  storeChanged()
  return ok(result.value.value)
}

/** Issues a bill: the next visible number for the financial year, and its content frozen as issued (P6). */
export function issueBill(input: IssueBillInput): Promise<Result<IssuedBill>> {
  return backend ? backend.issueBill(input) : Promise.resolve(dispatch(issueBillCommand(input)))
}

export function resetDemo(): void {
  demo = seedDemoState()
  save(demo)
  storeChanged()
}
