/**
 * The part of firestore.rules copied from the engine: the role table (permissions.ts), the capability each trip
 * event and ledger entry needs, and the allowed values of each list. `npm run rules:generate` writes it into
 * firestore.rules; the RC-01 test fails if the file falls behind the engine.
 */
import {
  CAPABILITIES,
  can,
  EXPENSE_CATEGORIES,
  LABOUR_SLOTS,
  LEDGER_ENTRY_CAPABILITY,
  PAYMENT_METHODS,
  ROLES,
  ROUNDING_POLICIES,
  TRIP_EVENT_CAPABILITY,
} from '../domain'

export const RULES_BEGIN = '    // BEGIN GENERATED from src/domain by `npm run rules:generate`. Do not edit by hand.'
export const RULES_END = '    // END GENERATED'

const q = (s: string): string => `'${s}'`
const list = (items: readonly string[]): string => `[${items.map(q).join(', ')}]`

function fn(name: string, body: string): string {
  return `    function ${name}() {\n      return ${body};\n    }`
}

function map(entries: [string, string][]): string {
  return `{\n${entries.map(([k, v]) => `        ${q(k)}: ${v}`).join(',\n')}\n      }`
}

export function renderRulesConstants(): string {
  const roles = map(ROLES.map((role) => [role, list(CAPABILITIES.filter((c) => can(role, c)))]))
  const events = map(Object.entries(TRIP_EVENT_CAPABILITY).map(([type, cap]) => [type, q(cap)]))
  const entries = map(Object.entries(LEDGER_ENTRY_CAPABILITY).map(([type, cap]) => [type, q(cap)]))
  return [
    RULES_BEGIN,
    fn('roleCapabilities', roles),
    fn('tripEventCapability', events),
    fn('ledgerEntryCapability', entries),
    fn('roundingPolicies', list(ROUNDING_POLICIES)),
    fn('paymentMethods', list(PAYMENT_METHODS)),
    fn('expenseCategories', list(EXPENSE_CATEGORIES)),
    fn('labourSlots', list(LABOUR_SLOTS)),
    RULES_END,
  ].join('\n')
}

/** Swaps the generated block inside a rules file for a fresh one. */
export function replaceGeneratedBlock(rules: string, block: string): string {
  const start = rules.indexOf(RULES_BEGIN)
  const end = rules.indexOf(RULES_END)
  if (start < 0 || end < start) throw new Error('firestore.rules is missing the generated block markers')
  return rules.slice(0, start) + block + rules.slice(end + RULES_END.length)
}

export function generatedBlockOf(rules: string): string | undefined {
  const start = rules.indexOf(RULES_BEGIN)
  const end = rules.indexOf(RULES_END)
  return start < 0 || end < start ? undefined : rules.slice(start, end + RULES_END.length)
}
