/**
 * Who may do what (U-07). The owner's answer fixes three roles; the exact split below is a proposed default (D-17)
 * to confirm with the owner — see docs/REQUIREMENTS_TRACEABILITY.md.
 * Firestore rules (P4) must enforce the same table. Rules cannot hide single fields, so anything a role may not
 * see (purchase rates, profit) has to live in a collection that role cannot read.
 */
import type { Actor, Role } from './common'
import { fail, ok, type Result } from './result'

export const CAPABILITIES = [
  'settings.edit',
  'users.manage',
  'customer.manage',
  'trip.open',
  'trip.close',
  'trip.viewAll',
  'trip.setDefaultRate',
  'trip.record',
  'purchase.record',
  'purchase.view',
  'profit.view',
  'sale.record',
  'sale.changeRate',
  'payment.record',
  'entry.reverse',
  'ledger.adjust',
  'month.close',
  'customer.viewBalance',
  'bill.send',
] as const
export type Capability = (typeof CAPABILITIES)[number]

const OWNER_ONLY: readonly Capability[] = ['settings.edit', 'users.manage', 'ledger.adjust', 'month.close']

const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set(CAPABILITIES),
  manager: new Set(CAPABILITIES.filter((c) => !OWNER_ONLY.includes(c))),
  // Driver: only the trip assigned to them. Sells at the trip's default rate; no purchase rates, no profit.
  driver: new Set<Capability>(['trip.record', 'sale.record', 'payment.record', 'customer.viewBalance', 'bill.send']),
}

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].has(capability)
}

export function requireCapability(actor: Actor, capability: Capability): Result<void> {
  return can(actor.actorRole, capability)
    ? ok(undefined)
    : fail('not_permitted', `The ${actor.actorRole} role cannot do "${capability}"`, { capability, role: actor.actorRole })
}
