/** App roles (U-07, answered at Gate A): owner = full access, manager = manager level, driver = trip details. */
export type Role = 'owner' | 'manager' | 'driver'

export type TripStatus = 'OPEN' | 'CLOSED'

/** Debit raises what the customer owes; credit lowers it (D-05). */
export type Direction = 'DEBIT' | 'CREDIT'

export interface Actor {
  actorId: string
  actorRole: Role
}
