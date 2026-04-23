import clientPromise from './mongodb'

// Sire production DB (users + shipments + invoices etc.) lives on the same
// Mongo cluster as ethan-admin — we just point the existing client at the
// `sire` database instead of `ethan-admin`.
export async function getSireDb() {
  const c = await clientPromise
  return c.db('sire')
}
