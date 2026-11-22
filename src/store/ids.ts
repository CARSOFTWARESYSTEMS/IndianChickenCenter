/**
 * Collision-resistant ids (D-06), made when a form opens and reused on retry.
 * crypto.getRandomValues works on plain-http LAN addresses too, unlike crypto.randomUUID.
 */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}
