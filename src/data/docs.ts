/**
 * How engine records are stored in Firestore (P4). Pure TypeScript with no Firebase import, so the app, the rules
 * tests and the P5 repositories all build the same documents, and firestore.rules checks exactly these shapes.
 *
 *   settings/business              BusinessSettings + updatedBy                  owner writes
 *   users/{uid}                    name, email, role                             owner edits others; invitee claims
 *   invites/{email}                name, role                                    owner
 *   customers/{id}                 Customer                                      owner, manager
 *   vehicles/{number}              registration number                           owner, manager
 *   trips/{tripId}                 Trip without money, plus the current rate     owner, manager open and close
 *   trips/{tripId}/events/{id}     TripEvent; LOADING keeps kg only              append-only
 *   trips/{tripId}/purchases/{id}  LOADING purchase rate and amount              owner, manager read
 *   trips/{tripId}/totals/close    money totals at close                         owner, manager read
 *   ledgerEntries/{id}             LedgerEntry                                   append-only
 *   ledgerClosures/{customerId}    last closed month for that customer           owner
 *
 * Security rules cannot hide single fields, so what a driver may not see (purchase rates, profit) has its own
 * documents (KNOWN_LIMITATIONS.md).
 */
import {
  fail,
  ok,
  type BusinessSettings,
  type Customer,
  type IsoDate,
  type LedgerEntry,
  type MonthKey,
  type OpeningBalanceEntry,
  type Result,
  type Role,
  type Trip,
  type TripEvent,
} from '../domain'

export const paths = {
  settings: () => 'settings/business',
  user: (uid: string) => `users/${uid}`,
  invite: (email: string) => `invites/${email}`,
  customer: (id: string) => `customers/${id}`,
  vehicle: (number: string) => `vehicles/${number}`,
  trip: (tripId: string) => `trips/${tripId}`,
  tripEvent: (tripId: string, id: string) => `trips/${tripId}/events/${id}`,
  purchase: (tripId: string, id: string) => `trips/${tripId}/purchases/${id}`,
  tripTotals: (tripId: string) => `trips/${tripId}/totals/close`,
  ledgerEntry: (id: string) => `ledgerEntries/${id}`,
  ledgerClosure: (customerId: string) => `ledgerClosures/${customerId}`,
}

/** One trip per vehicle per day (U-06): the id says which, so a second trip cannot be created. */
export const tripIdFor = (date: IsoDate, vehicleNumber: string): string => `trip_${date}_${vehicleNumber}`

/** Roles the owner can give from the app; another owner is added in the Firebase console. */
export const INVITABLE_ROLES = ['manager', 'driver'] as const satisfies readonly Role[]
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export interface UserDoc {
  name: string
  email: string
  role: Role
  addedBy: string
  addedOn: IsoDate
}

export interface InviteDoc {
  email: string
  name: string
  role: InvitableRole
  invitedBy: string
  invitedOn: IsoDate
}

export type SettingsDoc = BusinessSettings & { updatedBy: string }

export interface TripDoc {
  id: string
  date: IsoDate
  status: Trip['status']
  createdBy: string
  vehicleNumber: string
  driverId?: string
  driverName?: string
  /** The rate set when the trip opened. */
  defaultSaleRatePaisePerKg: number
  /** The rate now in force; drivers must sell at it. Changed only together with a DEFAULT_RATE event. */
  ratePaisePerKg: number
  rateEventId?: string
  closedBy?: string
  closedOn?: IsoDate
  /** Kg totals at close. Money totals are in trips/{tripId}/totals/close. */
  closeKg?: { loadedGrams: number; soldGrams: number; shopSoldGrams: number; wastageGrams: number }
}

export interface PurchaseDoc {
  id: string
  tripId: string
  createdBy: string
  grams: number
  ratePaisePerKg: number
  exactMilliPaise: number
  amount: number
}

export interface TripTotalsDoc {
  tripId: string
  purchasePaise: number
  salesPaise: number
  operatingPaise: number
  closedBy: string
}

export interface LedgerClosureDoc {
  customerId: string
  closedThrough: MonthKey
  closedBy: string
}

export interface VehicleDoc {
  number: string
  addedBy: string
}

/** One document change in a batched write. Several go together so the rules can check each against the others. */
export type DocWrite =
  | { op: 'set'; path: string; data: Record<string, unknown> }
  | { op: 'update'; path: string; data: Record<string, unknown> }
  | { op: 'delete'; path: string }

/** Firestore refuses `undefined`; the engine leaves optional fields out, and so must every stored document. */
export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = withoutUndefined(v)
    return out as T
  }
  return value
}

const set = (path: string, data: object): DocWrite => ({ op: 'set', path, data: withoutUndefined({ ...data }) })

// ---------------------------------------------------------------------------
// Settings and people
// ---------------------------------------------------------------------------

export function settingsWrites(settings: BusinessSettings, updatedBy: string): DocWrite[] {
  const doc: SettingsDoc = { ...settings, updatedBy }
  return [set(paths.settings(), doc)]
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function inviteWrites(
  input: { email: string; name: string; role: InvitableRole },
  invitedBy: string,
  today: IsoDate,
): Result<DocWrite[]> {
  const email = normalizeEmail(input.email)
  if (!EMAIL.test(email)) return fail('invalid_input', `"${input.email}" is not an email address`)
  const name = input.name.trim()
  if (!name) return fail('invalid_input', 'Name is required')
  if (!INVITABLE_ROLES.includes(input.role)) return fail('invalid_input', 'Choose Manager or Driver')
  const doc: InviteDoc = { email, name, role: input.role, invitedBy, invitedOn: today }
  return ok([set(paths.invite(email), doc)])
}

/** The invited person signs in with the invited Google account: their user record replaces the invite. */
export function claimInviteWrites(uid: string, invite: InviteDoc, today: IsoDate): DocWrite[] {
  const user: UserDoc = { name: invite.name, email: invite.email, role: invite.role, addedBy: invite.invitedBy, addedOn: today }
  return [set(paths.user(uid), user), { op: 'delete', path: paths.invite(invite.email) }]
}

// ---------------------------------------------------------------------------
// Customers and vehicles
// ---------------------------------------------------------------------------

/** A new customer, with the opening balance (if any) in the same write so it is always the first entry. */
export function newCustomerWrites(customer: Customer, opening?: OpeningBalanceEntry): DocWrite[] {
  const writes = [set(paths.customer(customer.id), customer)]
  if (opening) writes.push(set(paths.ledgerEntry(opening.id), opening))
  return writes
}

export function customerWrites(customer: Customer): DocWrite[] {
  return [set(paths.customer(customer.id), customer)]
}

export function vehicleWrites(number: string, addedBy: string): DocWrite[] {
  const doc: VehicleDoc = { number, addedBy }
  return [set(paths.vehicle(number), doc)]
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export function tripDoc(trip: Trip): Result<TripDoc> {
  if (trip.id !== tripIdFor(trip.date, trip.vehicleNumber)) {
    return fail('invalid_input', `A stored trip id must be ${tripIdFor(trip.date, trip.vehicleNumber)}`)
  }
  if (trip.defaultSaleRatePaisePerKg === undefined) return fail('invalid_rate', 'A trip needs a default selling rate')
  const doc: TripDoc = {
    id: trip.id,
    date: trip.date,
    status: trip.status,
    createdBy: trip.createdBy,
    vehicleNumber: trip.vehicleNumber,
    defaultSaleRatePaisePerKg: trip.defaultSaleRatePaisePerKg,
    ratePaisePerKg: trip.defaultSaleRatePaisePerKg,
  }
  if (trip.driverId !== undefined) doc.driverId = trip.driverId
  if (trip.driverName !== undefined) doc.driverName = trip.driverName
  return ok(doc)
}

export function openTripWrites(trip: Trip): Result<DocWrite[]> {
  if (trip.status !== 'OPEN') return fail('trip_closed', 'Only an open trip can be stored as new')
  const doc = tripDoc(trip)
  return doc.ok ? ok([set(paths.trip(trip.id), doc.value)]) : doc
}

/**
 * One trip event. A LOADING event is split so a driver sees the kg but not the purchase rate;
 * a DEFAULT_RATE event also moves the trip's current rate, which the rules check driver sales against.
 */
export function tripEventWrites(event: TripEvent): DocWrite[] {
  if (event.type === 'LOADING') {
    const { ratePaisePerKg, exactMilliPaise, amount, ...kgOnly } = event
    const purchase: PurchaseDoc = {
      id: event.id,
      tripId: event.tripId,
      createdBy: event.createdBy,
      grams: event.grams,
      ratePaisePerKg,
      exactMilliPaise,
      amount,
    }
    return [set(paths.tripEvent(event.tripId, event.id), kgOnly), set(paths.purchase(event.tripId, event.id), purchase)]
  }
  const writes = [set(paths.tripEvent(event.tripId, event.id), event)]
  if (event.type === 'DEFAULT_RATE') {
    writes.push({
      op: 'update',
      path: paths.trip(event.tripId),
      data: { ratePaisePerKg: event.ratePaisePerKg, rateEventId: event.id },
    })
  }
  return writes
}

/** Closing keeps kg on the trip (drivers see them) and puts the money totals where only owner and manager read. */
export function closeTripWrites(closed: Trip): Result<DocWrite[]> {
  const sum = closed.closeSummary
  if (closed.status !== 'CLOSED' || !sum || !closed.closedBy || !closed.closedOn) {
    return fail('invalid_input', 'Only a closed trip with its summary can be stored as closed')
  }
  const totals: TripTotalsDoc = {
    tripId: closed.id,
    purchasePaise: sum.purchasePaise,
    salesPaise: sum.salesPaise,
    operatingPaise: sum.operatingPaise,
    closedBy: closed.closedBy,
  }
  return ok([
    {
      op: 'update',
      path: paths.trip(closed.id),
      data: {
        status: 'CLOSED',
        closedBy: closed.closedBy,
        closedOn: closed.closedOn,
        closeKg: {
          loadedGrams: sum.loadedGrams,
          soldGrams: sum.soldGrams,
          shopSoldGrams: sum.shopSoldGrams,
          wastageGrams: sum.wastageGrams,
        },
      },
    },
    set(paths.tripTotals(closed.id), totals),
  ])
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/** One ledger entry. A month-end snapshot also moves the customer's closed month, which later entries are checked against. */
export function ledgerEntryWrites(entry: LedgerEntry): DocWrite[] {
  const writes = [set(paths.ledgerEntry(entry.id), entry)]
  if (entry.type === 'MONTH_END_SNAPSHOT') {
    const closure: LedgerClosureDoc = { customerId: entry.customerId, closedThrough: entry.month, closedBy: entry.createdBy }
    writes.push(set(paths.ledgerClosure(entry.customerId), closure))
  }
  return writes
}
