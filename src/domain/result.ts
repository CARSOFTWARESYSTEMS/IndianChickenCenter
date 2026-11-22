export type DomainErrorCode =
  | 'invalid_input'
  | 'invalid_quantity'
  | 'invalid_rate'
  | 'invalid_amount'
  | 'amount_mismatch'
  | 'unknown_policy'
  | 'rounding_policy_unset'
  | 'decision_pending'
  | 'id_conflict'
  | 'actor_mismatch'
  | 'not_permitted'
  | 'duplicate_trip'
  | 'reason_required'
  | 'duplicate_opening_balance'
  | 'opening_balance_not_first'
  | 'reversal_target_missing'
  | 'reversal_amount_mismatch'
  | 'already_reversed'
  | 'cannot_reverse'
  | 'month_closed'
  | 'trip_not_found'
  | 'trip_closed'
  | 'exceeds_stock'
  | 'stock_not_reconciled'
  | 'oversold'
  | 'not_online'
  | 'pending_writes'
  | 'invalid_phone'

export interface DomainError {
  code: DomainErrorCode
  message: string
  details?: Record<string, unknown>
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function fail<T = never>(
  code: DomainErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Result<T> {
  return { ok: false, error: details ? { code, message, details } : { code, message } }
}
