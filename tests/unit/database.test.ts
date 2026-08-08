import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { openDB } from "idb"

import { closeDatabase, openCompatibleDatabase } from "@/features/storage/database"

async function createVersion(version: number) {
  const db = await openDB("whisdom", version, {
    upgrade(database, oldVersion, newVersion, transaction) {
      void oldVersion;
      void newVersion;
      void transaction;
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings")
      if (!database.objectStoreNames.contains("transcripts")) database.createObjectStore("transcripts", { keyPath: "id" })
    },
  })
  db.close()
}

afterEach(async () => {
  await closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("whisdom")
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})

describe("MIG-01 compatible database open", () => {
  it("uses the idb@8 versionless callback signature", async () => {
    const source = await import("@/features/storage/database?raw")
    expect(source.default).toContain("openDB(WHISDOM_DB_NAME, undefined,")
    expect(source.default).not.toMatch(/openDB\(WHISDOM_DB_NAME,\s*\d/)
  })

  it("creates only the v1-compatible fresh layout", async () => {
    const result = await openCompatibleDatabase()
    expect(result.status).toBe("ready")
    if (result.status !== "ready") throw new Error("expected ready")
    expect(result.version).toBe(1)
    expect(Array.from(result.db.objectStoreNames)).toEqual(["settings", "transcripts"])
  })

  it.each([1, 2] as const)("opens existing v%s without downgrade", async (version) => {
    await createVersion(version)
    const result = await openCompatibleDatabase()
    expect(result.status).toBe("ready")
    if (result.status !== "ready") throw new Error("expected ready")
    expect(result.version).toBe(version)
  })

  it("closes and reports unsupported newer data", async () => {
    await createVersion(3)
    const result = await openCompatibleDatabase()
    expect(result).toEqual({ status: "unsupported", foundVersion: 3, maximumVersion: 2 })
  })
})
