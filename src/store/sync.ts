/**
 * Where each save is (plan §5): "Saved on phone" until the cloud confirms it, "Saved to cloud" after,
 * or "Needs attention" with the reason when the cloud refuses it. Pure state with no Firebase import;
 * the cloud store (cloud.ts) fills it.
 */
import { useSyncExternalStore } from 'react'
import type { DomainError } from '../domain'
import type { ChangeKind } from '../data/diff'

export interface SyncItem {
  id: string
  kind: ChangeKind
  detail: string
  /** Epoch milliseconds when it was saved on the phone. */
  at: number
  status: 'pending' | 'saved' | 'attention'
  error?: DomainError
  /** Documents this save created or changed, to check after a restart whether they reached the cloud. */
  paths: string[]
}

export interface SyncState {
  /** True while signed in to the cloud (false in demo mode). */
  cloud: boolean
  /** The first reads have arrived (from the phone's copy or the cloud), so screens can show real data. */
  ready: boolean
  items: SyncItem[]
  /** Paths of documents with writes this phone has not yet had confirmed. */
  pendingPaths: ReadonlySet<string>
}

const INITIAL: SyncState = { cloud: false, ready: false, items: [], pendingPaths: new Set() }
let state: SyncState = INITIAL
const listeners = new Set<() => void>()
let persistItems: ((items: SyncItem[]) => void) | undefined

export function getSync(): SyncState {
  return state
}

export function setSync(patch: Partial<SyncState>): void {
  const itemsChanged = patch.items !== undefined && patch.items !== state.items
  state = { ...state, ...patch }
  if (itemsChanged) persistItems?.(state.items)
  listeners.forEach((l) => l())
}

/** The cloud store keeps unconfirmed and refused saves on the phone, so they survive a restart. */
export function onItemsChange(fn: ((items: SyncItem[]) => void) | undefined): void {
  persistItems = fn
}

export function resetSync(): void {
  state = INITIAL
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSync(): SyncState {
  return useSyncExternalStore(subscribe, getSync, getSync)
}

export const pendingCount = (s: SyncState): number => s.items.filter((i) => i.status === 'pending').length
export const attentionItems = (s: SyncState): SyncItem[] => s.items.filter((i) => i.status === 'attention')

/** True when a ledger entry or trip event has not reached the cloud yet. */
export function isPending(s: SyncState, path: string): boolean {
  return s.pendingPaths.has(path)
}

/** Removes a "needs attention" item once the person has read it. */
export function dismiss(id: string): void {
  setSync({ items: state.items.filter((i) => i.id !== id) })
}
