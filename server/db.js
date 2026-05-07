import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const file = join(__dir, '..', 'db.json')

const adapter = new JSONFile(file)
export const db = new Low(adapter, {
  holdings: [],
  analyses: [],
  notifications: [],
  settings: {}
})

export async function initDb() {
  await db.read()
  db.data ??= { holdings: [], analyses: [], notifications: [], settings: {} }
  await db.write()
}

let _id = 0
export function nextId(collection) {
  const items = db.data[collection]
  return items.length ? Math.max(...items.map(i => i.id)) + 1 : 1
}
