import { openDB, type IDBPDatabase } from "idb"

export const WHISDOM_DB_NAME = "whisdom"
export const WHISDOM_DB_VERSION = 2
export type SupportedDatabaseVersion = 1 | 2
export type DatabaseOpenResult =
  | { status: "ready"; version: SupportedDatabaseVersion; db: IDBPDatabase }
  | { status: "unsupported"; foundVersion: number; maximumVersion: 2 }

let compatibleOpen: Promise<DatabaseOpenResult> | null = null

function isSupported(version: number): version is SupportedDatabaseVersion {
  return version === 1 || version === 2
}

export function openCompatibleDatabase(): Promise<DatabaseOpenResult> {
  compatibleOpen ??= openDB(WHISDOM_DB_NAME, undefined, {
    upgrade(database, oldVersion, newVersion, transaction) {
      void newVersion;
      void transaction;
      if (oldVersion !== 0) throw new Error("storage.unexpected-versionless-upgrade")
      database.createObjectStore("settings")
      database.createObjectStore("transcripts", { keyPath: "id" })
    },
    blocking(_currentVersion, _blockedVersion, event) {
      ;(event.target as IDBDatabase).close()
      compatibleOpen = null
    },
    terminated() {
      compatibleOpen = null
    },
  }).then((db): DatabaseOpenResult => {
    if (!isSupported(db.version)) {
      const foundVersion = db.version
      db.close()
      compatibleOpen = null
      return { status: "unsupported", foundVersion, maximumVersion: 2 }
    }
    return { status: "ready", version: db.version, db }
  }).catch((error) => {
    compatibleOpen = null
    throw error
  })
  return compatibleOpen
}

export async function closeDatabase(): Promise<void> {
  const current = compatibleOpen
  compatibleOpen = null
  if (!current) return
  const result = await current
  if (result.status === "ready") result.db.close()
}
