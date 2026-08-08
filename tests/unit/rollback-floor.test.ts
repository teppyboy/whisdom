import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// @ts-expect-error -- release tooling is plain ESM JavaScript with no type declarations.
import { run } from "../../scripts/check-rollback-floor.mjs"

const execFileAsync = promisify(execFile)

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url))
const checkerPath = path.join(repositoryRoot, "scripts", "check-rollback-floor.mjs")

/** Pre-Slice-1A commit from the approved plan; never a valid rollback target. */
const PRE_FLOOR_SHA = "4098fe355588ae1331a1f574a72a42e022bcfaae"
const ABSENT_SHA = "0123456789abcdef0123456789abcdef01234567"

const deterministicGitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Floor Fixture",
  GIT_AUTHOR_EMAIL: "floor@example.invalid",
  GIT_COMMITTER_NAME: "Floor Fixture",
  GIT_COMMITTER_EMAIL: "floor@example.invalid",
}

let fixtureRoot = ""
let outsideRepositoryRoot = ""
let preFloorSha = ""
let floorSha = ""
let descendantSha = ""
let divergentSha = ""
let evidenceCounter = 0

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, env: deterministicGitEnv })
  return stdout.trim()
}

async function commit(cwd: string, message: string, committedAt: string): Promise<string> {
  await execFileAsync("git", ["commit", "--allow-empty", "-q", "-m", message], {
    cwd,
    env: { ...deterministicGitEnv, GIT_AUTHOR_DATE: committedAt, GIT_COMMITTER_DATE: committedAt },
  })
  return git(cwd, ["rev-parse", "HEAD"])
}

function deployedEvidence(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: "deployed",
    lowerCommitSha: floorSha,
    deploymentUrl: "https://whisdom.example/",
    deployedAtUtc: "2026-07-29T10:00:00.000Z",
    verifiedAtUtc: "2026-07-29T10:30:00.000Z",
    approvedBy: "release-approver",
    approvedAtUtc: "2026-07-29T09:00:00.000Z",
    smoke: { fresh: "passed", v1: "passed", v2: "passed", unsupportedV3: "passed" },
  }
}

function awaitingEvidence(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: "awaiting-deployment",
    lowerCommitSha: floorSha,
    deploymentUrl: "",
    deployedAtUtc: "",
    verifiedAtUtc: "",
    approvedBy: "release-approver",
    approvedAtUtc: "2026-07-29T09:00:00.000Z",
    smoke: { fresh: "pending", v1: "pending", v2: "pending", unsupportedV3: "pending" },
  }
}

async function writeEvidence(contents: unknown): Promise<string> {
  evidenceCounter += 1
  const evidencePath = path.join(fixtureRoot, `evidence-${evidenceCounter}.json`)
  const text = typeof contents === "string" ? contents : JSON.stringify(contents, null, 2)
  await writeFile(evidencePath, text, "utf8")
  return evidencePath
}

async function checkAgainst(evidence: unknown, candidateSha: string, cwd = fixtureRoot) {
  return run({ argv: [candidateSha], evidencePath: await writeEvidence(evidence), cwd })
}

function omitKey(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const remaining = { ...record }
  delete remaining[key]
  return remaining
}

async function spawnChecker(args: string[]): Promise<number> {
  try {
    await execFileAsync(process.execPath, [checkerPath, ...args], { cwd: repositoryRoot })
    return 0
  } catch (error) {
    const code = (error as { code?: number | string }).code
    return typeof code === "number" ? code : -1
  }
}

beforeAll(async () => {
  fixtureRoot = await mkdtemp(path.join(tmpdir(), "whisdom-rollback-floor-"))
  outsideRepositoryRoot = await mkdtemp(path.join(tmpdir(), "whisdom-no-git-"))

  await git(fixtureRoot, ["init", "-q", "-b", "master"])
  await git(fixtureRoot, ["config", "commit.gpgsign", "false"])

  preFloorSha = await commit(fixtureRoot, "pre-floor baseline", "2026-07-01T00:00:00Z")
  floorSha = await commit(fixtureRoot, "slice 1a rollback floor", "2026-07-02T00:00:00Z")
  descendantSha = await commit(fixtureRoot, "descendant repair", "2026-07-03T00:00:00Z")

  // Divergent history is deliberately newer, tagged, and on a release-sounding branch so the
  // test proves those signals never substitute for `git merge-base --is-ancestor`.
  await git(fixtureRoot, ["checkout", "-q", "-b", "release-candidate", preFloorSha])
  divergentSha = await commit(fixtureRoot, "divergent rebuild", "2027-01-01T00:00:00Z")
  await git(fixtureRoot, ["tag", "v-approved-release", divergentSha])
  await git(fixtureRoot, ["checkout", "-q", "master"])
}, 60_000)

afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
  await rm(outsideRepositoryRoot, { recursive: true, force: true })
})

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("rollback floor checker — allowed targets", () => {
  it("exits 0 for the floor commit itself", async () => {
    await expect(checkAgainst(deployedEvidence(), floorSha)).resolves.toBe(0)
  })

  it("exits 0 for a descendant of the floor commit", async () => {
    await expect(checkAgainst(deployedEvidence(), descendantSha)).resolves.toBe(0)
  })

  // The documented PowerShell generator writes UTF-8 with a BOM; the checker must not
  // reject its own evidence file on encoding alone.
  it("exits 0 for BOM-prefixed deployed evidence", async () => {
    await expect(
      checkAgainst(`\uFEFF${JSON.stringify(deployedEvidence())}`, floorSha),
    ).resolves.toBe(0)
  })

  it("still fails closed on BOM-prefixed awaiting evidence", async () => {
    await expect(
      checkAgainst(`\uFEFF${JSON.stringify(awaitingEvidence())}`, floorSha),
    ).resolves.toBe(1)
  })
})

describe("rollback floor checker — blocked targets", () => {
  it("exits 1 for a pre-floor ancestor commit", async () => {
    await expect(checkAgainst(deployedEvidence(), preFloorSha)).resolves.toBe(1)
  })

  it("exits 1 for a divergent commit despite newer date, branch, and tag", async () => {
    await expect(checkAgainst(deployedEvidence(), divergentSha)).resolves.toBe(1)
  })

  it("exits 1 for awaiting-deployment evidence even at the recorded floor", async () => {
    await expect(checkAgainst(awaitingEvidence(), floorSha)).resolves.toBe(1)
  })

  it("exits 1 when release evidence is missing", async () => {
    const missingPath = path.join(fixtureRoot, "does-not-exist.json")
    await expect(run({ argv: [floorSha], evidencePath: missingPath, cwd: fixtureRoot })).resolves.toBe(1)
  })

  it("exits 1 when the candidate SHA is abbreviated", async () => {
    await expect(checkAgainst(deployedEvidence(), floorSha.slice(0, 7))).resolves.toBe(1)
  })

  it("exits 1 when the candidate SHA is uppercase", async () => {
    await expect(checkAgainst(deployedEvidence(), floorSha.toUpperCase())).resolves.toBe(1)
  })

  it("exits 1 when Git evidence is unavailable outside a repository", async () => {
    await expect(checkAgainst(deployedEvidence(), floorSha, outsideRepositoryRoot)).resolves.toBe(1)
  })

  it("exits 1 when the candidate commit does not exist in the repository", async () => {
    await expect(checkAgainst(deployedEvidence(), ABSENT_SHA)).resolves.toBe(1)
  })

  it("exits 1 when the recorded floor commit does not exist in the repository", async () => {
    await expect(
      checkAgainst({ ...deployedEvidence(), lowerCommitSha: ABSENT_SHA }, descendantSha),
    ).resolves.toBe(1)
  })
})

const malformedCases: Array<[string, (record: Record<string, unknown>) => unknown]> = [
  ["an unknown key", (record) => ({ ...record, rollbackApproved: true })],
  ["a missing key", (record) => omitKey(record, "verifiedAtUtc")],
  ["a non-object root", (record) => [record]],
  ["a null root", () => null],
  ["a string schemaVersion", (record) => ({ ...record, schemaVersion: "1" })],
  ["an unsupported schemaVersion", (record) => ({ ...record, schemaVersion: 2 })],
  ["an unknown status", (record) => ({ ...record, status: "rolled-back" })],
  ["an abbreviated lowerCommitSha", (record) => ({ ...record, lowerCommitSha: "4098fe3" })],
  [
    "an uppercase lowerCommitSha",
    (record) => ({ ...record, lowerCommitSha: PRE_FLOOR_SHA.toUpperCase() }),
  ],
  ["an empty approver login", (record) => ({ ...record, approvedBy: "" })],
  ["an approver login starting with a hyphen", (record) => ({ ...record, approvedBy: "-approver" })],
  ["an approver login containing a space", (record) => ({ ...record, approvedBy: "release approver" })],
  ["an over-long approver login", (record) => ({ ...record, approvedBy: "a".repeat(40) })],
  ["a second-precision approvedAtUtc", (record) => ({ ...record, approvedAtUtc: "2026-07-29T09:00:00Z" })],
  ["an offset approvedAtUtc", (record) => ({ ...record, approvedAtUtc: "2026-07-29T09:00:00.000+00:00" })],
  [
    "an impossible calendar deployedAtUtc",
    (record) => ({ ...record, deployedAtUtc: "2026-02-31T09:00:00.000Z" }),
  ],
  ["an http deploymentUrl", (record) => ({ ...record, deploymentUrl: "http://whisdom.example/" })],
  ["an empty deployed deploymentUrl", (record) => ({ ...record, deploymentUrl: "" })],
  ["a relative deploymentUrl", (record) => ({ ...record, deploymentUrl: "/precision-studio" })],
  [
    "a pending smoke value while deployed",
    (record) => ({ ...record, smoke: { fresh: "passed", v1: "passed", v2: "pending", unsupportedV3: "passed" } }),
  ],
  [
    "an unknown smoke key",
    (record) => ({
      ...record,
      smoke: { fresh: "passed", v1: "passed", v2: "passed", unsupportedV3: "passed", v3: "passed" },
    }),
  ],
  [
    "a missing smoke key",
    (record) => ({ ...record, smoke: { fresh: "passed", v1: "passed", v2: "passed" } }),
  ],
  ["a null smoke object", (record) => ({ ...record, smoke: null })],
]

describe("rollback floor checker — malformed evidence fails closed", () => {
  it.each(malformedCases)("exits 1 for %s", async (_label, mutate) => {
    await expect(checkAgainst(mutate(deployedEvidence()), floorSha)).resolves.toBe(1)
  })

  it("exits 1 for syntactically invalid JSON", async () => {
    await expect(checkAgainst("{ not json", floorSha)).resolves.toBe(1)
  })

  it("exits 1 when awaiting evidence carries deployment fields", async () => {
    await expect(
      checkAgainst({ ...awaitingEvidence(), deploymentUrl: "https://whisdom.example/" }, floorSha),
    ).resolves.toBe(1)
  })

  it("exits 1 when awaiting evidence claims passed smoke results", async () => {
    await expect(
      checkAgainst(
        {
          ...awaitingEvidence(),
          smoke: { fresh: "passed", v1: "passed", v2: "passed", unsupportedV3: "passed" },
        },
        floorSha,
      ),
    ).resolves.toBe(1)
  })
})

describe("rollback floor checker — usage errors", () => {
  it("exits 2 when no candidate argument is supplied", async () => {
    await expect(
      run({ argv: [], evidencePath: await writeEvidence(deployedEvidence()), cwd: fixtureRoot }),
    ).resolves.toBe(2)
  })

  it("exits 2 when two candidate arguments are supplied", async () => {
    await expect(
      run({
        argv: [floorSha, descendantSha],
        evidencePath: await writeEvidence(deployedEvidence()),
        cwd: fixtureRoot,
      }),
    ).resolves.toBe(2)
  })

  it("exits 2 when invoked with no options at all", async () => {
    await expect(run()).resolves.toBe(2)
  })
})

describe("rollback floor checker — command line contract", () => {
  it("exits 2 from the CLI with zero arguments", async () => {
    await expect(spawnChecker([])).resolves.toBe(2)
  }, 30_000)

  it("exits 2 from the CLI with two arguments", async () => {
    await expect(spawnChecker([PRE_FLOOR_SHA, PRE_FLOOR_SHA])).resolves.toBe(2)
  }, 30_000)

  it("exits 1 from the CLI for the pre-Slice-1A commit", async () => {
    await expect(spawnChecker([PRE_FLOOR_SHA])).resolves.toBe(1)
  }, 30_000)
})
