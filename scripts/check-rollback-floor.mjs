#!/usr/bin/env node
// Rollback-floor guard. After schema 2 exposure, production may only move to the
// deployed Slice 1A commit recorded in the release evidence file, or a descendant.
// Ancestry is proven exclusively by `git merge-base --is-ancestor`. Commit date,
// branch name, tag, approval text, network status, and workflow success are never
// treated as ancestry evidence. Every unexpected condition fails closed.
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const USAGE = "Usage: pnpm release:check-rollback-floor -- <candidate-full-sha>"

const EXIT_ALLOWED = 0
const EXIT_BLOCKED = 1
const EXIT_USAGE = 2

const FULL_SHA = /^[0-9a-f]{40}$/
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const EVIDENCE_KEYS = [
  "schemaVersion",
  "status",
  "lowerCommitSha",
  "deploymentUrl",
  "deployedAtUtc",
  "verifiedAtUtc",
  "approvedBy",
  "approvedAtUtc",
  "smoke",
]
const SMOKE_KEYS = ["fresh", "v1", "v2", "unsupportedV3"]
const EMPTY_UNTIL_DEPLOYED_KEYS = ["deploymentUrl", "deployedAtUtc", "verifiedAtUtc"]
const SMOKE_VALUE_BY_STATUS = { "awaiting-deployment": "pending", deployed: "passed" }

const RELEASE_EVIDENCE_RELATIVE_PATH = "docs/releases/precision-studio-slice-1a.json"

const bounded = (value) => String(value).slice(0, 64)

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype

const hasExactKeys = (object, keys) =>
  Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key))

const isFullLowercaseSha = (value) => typeof value === "string" && FULL_SHA.test(value)

function isCanonicalUtc(value) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return false
  const instant = new Date(value)
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value
}

function isAbsoluteHttpsUrl(value) {
  if (typeof value !== "string" || value === "") return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

const rejected = (reason) => ({ ok: false, reason })

/**
 * Parses release evidence text into a trusted floor record.
 * Closed schema: unknown keys, wrong types, and status-inconsistent values are rejected.
 * A leading UTF-8 BOM is tolerated because the documented PowerShell generator emits one;
 * this is an encoding concern only and relaxes no schema, status, or ancestry requirement.
 */
function parseReleaseEvidence(text) {
  let value
  try {
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return rejected("release evidence is not valid JSON")
  }

  if (!isPlainObject(value)) return rejected("release evidence must be a JSON object")
  if (!hasExactKeys(value, EVIDENCE_KEYS))
    return rejected(`release evidence keys must be exactly: ${EVIDENCE_KEYS.join(", ")}`)
  if (value.schemaVersion !== 1) return rejected("schemaVersion must be the number 1")

  const status = value.status
  if (status !== "awaiting-deployment" && status !== "deployed")
    return rejected(`status must be awaiting-deployment or deployed, received ${bounded(status)}`)
  if (!isFullLowercaseSha(value.lowerCommitSha))
    return rejected("lowerCommitSha must be a full 40-character lowercase SHA")
  if (typeof value.approvedBy !== "string" || !GITHUB_LOGIN.test(value.approvedBy))
    return rejected("approvedBy must be a GitHub login matching the release approver syntax")
  if (!isCanonicalUtc(value.approvedAtUtc))
    return rejected("approvedAtUtc must be canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ")

  const smoke = value.smoke
  if (!isPlainObject(smoke)) return rejected("smoke must be a JSON object")
  if (!hasExactKeys(smoke, SMOKE_KEYS))
    return rejected(`smoke keys must be exactly: ${SMOKE_KEYS.join(", ")}`)

  const requiredSmokeValue = SMOKE_VALUE_BY_STATUS[status]
  for (const key of SMOKE_KEYS) {
    if (smoke[key] !== requiredSmokeValue)
      return rejected(`smoke.${key} must be ${requiredSmokeValue} while status is ${status}`)
  }

  if (status === "awaiting-deployment") {
    for (const key of EMPTY_UNTIL_DEPLOYED_KEYS) {
      if (value[key] !== "")
        return rejected(`${key} must be an empty string while status is awaiting-deployment`)
    }
    return { ok: true, status, lowerCommitSha: value.lowerCommitSha }
  }

  if (!isAbsoluteHttpsUrl(value.deploymentUrl))
    return rejected("deploymentUrl must be an absolute HTTPS URL while status is deployed")
  if (!isCanonicalUtc(value.deployedAtUtc))
    return rejected("deployedAtUtc must be canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ")
  if (!isCanonicalUtc(value.verifiedAtUtc))
    return rejected("verifiedAtUtc must be canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ")

  return { ok: true, status, lowerCommitSha: value.lowerCommitSha }
}

/** Sole ancestry oracle. Spawn failure, missing object, and nonzero status all fail closed. */
async function isFloorOrDescendant(floorSha, candidateSha, cwd) {
  try {
    await execFileAsync("git", ["merge-base", "--is-ancestor", floorSha, candidateSha], { cwd })
    return true
  } catch {
    return false
  }
}

function refuse(exitCode, reason) {
  console.error(reason)
  return exitCode
}

/**
 * @param {{ argv?: string[], evidencePath?: string, cwd?: string }} options
 * @returns {Promise<0 | 1 | 2>} contractual exit code
 */
export async function run({ argv = [], evidencePath, cwd } = {}) {
  const positional = argv[0] === "--" ? argv.slice(1) : argv
  if (positional.length !== 1) return refuse(EXIT_USAGE, USAGE)
  if (typeof evidencePath !== "string" || evidencePath === "")
    return refuse(EXIT_USAGE, `${USAGE}\nevidencePath must be a non-empty path`)
  if (typeof cwd !== "string" || cwd === "")
    return refuse(EXIT_USAGE, `${USAGE}\ncwd must be a non-empty repository path`)

  const candidateSha = positional[0]
  if (!isFullLowercaseSha(candidateSha))
    return refuse(EXIT_BLOCKED, "candidate must be a full 40-character lowercase SHA")

  let evidenceText
  try {
    evidenceText = await readFile(evidencePath, "utf8")
  } catch {
    return refuse(EXIT_BLOCKED, `release evidence is missing or unreadable at ${bounded(evidencePath)}`)
  }

  const evidence = parseReleaseEvidence(evidenceText)
  if (!evidence.ok) return refuse(EXIT_BLOCKED, evidence.reason)
  if (evidence.status !== "deployed")
    return refuse(EXIT_BLOCKED, "release evidence is not deployed; no rollback floor is established yet")

  const allowed = await isFloorOrDescendant(evidence.lowerCommitSha, candidateSha, cwd)
  if (!allowed)
    return refuse(
      EXIT_BLOCKED,
      `candidate ${candidateSha} is neither the rollback floor ${evidence.lowerCommitSha} nor a descendant of it`,
    )

  console.log(`candidate ${candidateSha} is at or above rollback floor ${evidence.lowerCommitSha}`)
  return EXIT_ALLOWED
}

const modulePath = fileURLToPath(import.meta.url)
const repositoryRoot = path.resolve(path.dirname(modulePath), "..")
const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  process.exitCode = await run({
    argv: process.argv.slice(2),
    evidencePath: path.join(repositoryRoot, RELEASE_EVIDENCE_RELATIVE_PATH),
    cwd: repositoryRoot,
  })
}
