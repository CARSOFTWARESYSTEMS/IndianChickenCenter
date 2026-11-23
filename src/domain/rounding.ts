import { divFloor, isSafeNonNegativeInt, type MilliPaise, type Paise } from './units'

/**
 * How an exact line value becomes the posted amount (plan Part 2 §2).
 * Which policy is live for customer SALE lines is owner decision U-01.
 *  - TRUNCATE_RUPEE: drop paise (matches the source ledger: 8,076.80 → 8,076)
 *  - ROUND_HALF_UP_RUPEE: nearest rupee, .50 goes up
 *  - EXACT_PAISE: keep paise; sub-paise rounded half-up
 */
export const ROUNDING_POLICIES = ['TRUNCATE_RUPEE', 'ROUND_HALF_UP_RUPEE', 'EXACT_PAISE'] as const
export type RoundingPolicyId = (typeof ROUNDING_POLICIES)[number]

const MILLI_PER_RUPEE = 100_000

export function isRoundingPolicy(value: unknown): value is RoundingPolicyId {
  return (ROUNDING_POLICIES as readonly unknown[]).includes(value)
}

export function postAmount(exact: MilliPaise, policy: RoundingPolicyId): Paise {
  if (!isSafeNonNegativeInt(exact) || exact > Number.MAX_SAFE_INTEGER - MILLI_PER_RUPEE) {
    throw new RangeError(`postAmount needs a non-negative safe integer, got ${exact}`)
  }
  switch (policy) {
    case 'TRUNCATE_RUPEE':
      return divFloor(exact, MILLI_PER_RUPEE) * 100
    case 'ROUND_HALF_UP_RUPEE':
      return divFloor(exact + MILLI_PER_RUPEE / 2, MILLI_PER_RUPEE) * 100
    case 'EXACT_PAISE':
      return divFloor(exact + 500, 1_000)
  }
}

/** Exact paise (sub-paise half-up). Used for fuel, purchases and orders, which are not bill lines and not subject to U-01. */
export function toExactPaise(exact: MilliPaise): Paise {
  return postAmount(exact, 'EXACT_PAISE')
}
