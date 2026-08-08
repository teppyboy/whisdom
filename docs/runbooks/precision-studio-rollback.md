# Precision Studio rollback floor

After schema 2 exposure, Whisdom may roll back only to the deployed Slice 1A commit recorded in `docs/releases/precision-studio-slice-1a.json` or a descendant. Older builds explicitly request IndexedDB version 1 and can fail against version 2 data.

Roll forward whenever possible. Never reset or force-move `master`, and never redeploy an artifact whose source commit predates the floor.

## Preflight

1. Confirm the worktree is on `master` and clean: `git status --short` reports nothing.
2. Fetch and confirm the local branch matches the remote: `git fetch origin` then `git rev-parse HEAD origin/master`.
3. Confirm the evidence file exists at `docs/releases/precision-studio-slice-1a.json` and is committed on `master`.
4. Confirm no competing deployment workflow exists; `.github/workflows/ci.yml` push-to-`master` is the sole GitHub Pages deployment path.

## Inspect evidence

Read the record before trusting any target:

```powershell
$evidence = Get-Content docs/releases/precision-studio-slice-1a.json -Raw | ConvertFrom-Json
$evidence.status
$evidence.lowerCommitSha
$evidence.deploymentUrl
$evidence.smoke
```

`status` must be `deployed` before any rollback decision. `lowerCommitSha` is the permanent floor. Never edit the floor SHA to permit an older target; roll forward with a fixed descendant instead.

## Run the checker

The guard accepts exactly one positional full SHA and proves ancestry only through `git merge-base --is-ancestor`:

```powershell
pnpm release:check-rollback-floor -- <candidate-full-sha>
```

Exit codes are contractual:

| Exit | Meaning |
| --- | --- |
| `0` | Evidence is `deployed` and the candidate equals or descends from `lowerCommitSha`. Proceed. |
| `1` | Malformed, missing, or unreadable evidence; `awaiting-deployment` status; unavailable Git evidence; non-full SHA; or a candidate that is not the floor or a descendant. Stop. |
| `2` | Usage or invocation error. Fix the command and rerun. |

Commit date, branch name, tag, approval text, network status, and workflow success are never ancestry proof. Reject any nonzero result; do not override it.

## Record Slice 1A

1. Obtain explicit human approval. In manual release review, attest that `approvedBy` is the approving human's exact GitHub login, that this person reviewed the candidate and evidence, and that approval occurred outside automation. Commit awaiting evidence, land only Foundation and Slice 1A on `master`, and push. No Slice 1B file or numeric-v2 open may be present; checker success alone is insufficient.
2. Observe the existing `.github/workflows/ci.yml` push-to-`master` CI and Pages deployment. `workflow_dispatch` validates and builds only and does not deploy. Never create or invoke a competing deployment workflow.
3. Run deployed `MIG-01` with `WHISDOM_E2E_BASE_URL`; fresh/v1/v2 must list and open, rename seeded data, save a new transcript through the shipped adapter, delete with v2 tombstone or v1 physical semantics, close and reopen, preserve schema and version, and emit no `VersionError`. Unsupported-v3 must localize, refuse mutation, and remain byte-for-byte unchanged.
4. Preserve Playwright output, exact deployed URL, push-to-`master` workflow run URL, exact UTC deployment and verification times, all four passing cases, and absence of `VersionError` in release review evidence.
5. Transition only `status`, deployment and verification fields, and smoke values to deployed; keep `lowerCommitSha`, `approvedBy`, and `approvedAtUtc` unchanged.
6. Run `pnpm release:check-rollback-floor -- $lowerCommitSha`; require exit 0. Run the same positional command against every proposed rollback descendant; reject nonzero.

## Roll back

1. Stop rollout and preserve production evidence.
2. Select the recorded floor commit or a descendant.
3. Create a revert or repair commit on `master`; never reset or force-move `master`.
4. Run the guard against that exact descendant SHA and all repository gates.
5. Push the descendant to `master`; observe existing `.github/workflows/ci.yml` CI and Pages jobs. Never use `workflow_dispatch` to deploy and never add a second deployment workflow.
6. Smoke an existing v2 profile through list, open, rename, save, tombstone-delete, and reopen; confirm no downgrade request and intact v2 stores.
7. Record target SHA, workflow run URL, deployment URL, UTC time, operator, and smoke result in the release incident record.

## Forward redeploy

Preferred recovery is a fix that moves production forward:

1. Commit the fix on `master` as a descendant of the current head.
2. Run `pnpm release:check-rollback-floor -- (git rev-parse HEAD)` and require exit 0.
3. Run the full gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.
4. Push to `master` and observe the existing CI and Pages jobs to completion.
5. Repeat the v2 browser smoke against the new deployment and record the result.

Never edit the floor SHA to permit an older target. Roll forward with a fixed descendant instead.
