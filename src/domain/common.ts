/** Who is acting. Roles beyond the owner depend on U-07 (will staff use the app?). */
export type Role = 'owner' | 'staff'

export type TripStatus = 'OPEN' | 'CLOSED'

/** Debit raises what the customer owes; credit lowers it (D-05). */
export type Direction = 'DEBIT' | 'CREDIT'

export interface Actor {
  actorId: string
  actorRole: Role
}
