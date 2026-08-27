#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
"") apply=false ;;
--apply) apply=true ;;
*)
  echo "Usage: $0 [--apply]" >&2
  exit 64
  ;;
esac

node --input-type=module - "server/src/helper/models.rs" "$apply" <<'NODE'
import { readFile, writeFile } from "node:fs/promises"

const [catalogPath, apply] = process.argv.slice(2)
const repository = "ggerganov/whisper.cpp"
const catalog = await readFile(catalogPath, "utf8")
const modelResponse = await fetch(`https://huggingface.co/api/models/${repository}`)
if (!modelResponse.ok) throw new Error(`Hugging Face model lookup failed: ${modelResponse.status}`)
const { sha: revision } = await modelResponse.json()
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Hugging Face returned an invalid revision")

const treeResponse = await fetch(
  `https://huggingface.co/api/models/${repository}/tree/${revision}?recursive=true&expand=true`
)
if (!treeResponse.ok) throw new Error(`Hugging Face tree lookup failed: ${treeResponse.status}`)
const tree = await treeResponse.json()
if (!Array.isArray(tree)) throw new Error("Hugging Face returned an invalid repository tree")

const blocks = [...catalog.matchAll(/NativeModel \{[\s\S]*?\n    \},/g)]
if (blocks.length === 0) throw new Error("No native model catalog entries found")
let updated = catalog
for (const match of blocks) {
  const block = match[0]
  const filename = /filename: "([^"]+)"/.exec(block)?.[1]
  if (!filename) throw new Error("Catalog entry has no filename")
  const remote = tree.find((entry) => entry.path === filename)
  const hash = remote?.lfs?.oid
  const size = remote?.lfs?.size
  if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isSafeInteger(size) || size <= 0) {
    throw new Error(`Missing immutable LFS metadata for ${filename}`)
  }
  const next = block
    .replace(/size_bytes: [\d_]+,/, `size_bytes: ${size.toLocaleString("en-US").replaceAll(",", "_")},`)
    .replace(/url: "[^"]+",/, `url: "https://huggingface.co/${repository}/resolve/${revision}/${filename}?download=true",`)
    .replace(/sha256: "[a-f0-9]{64}",/, `sha256: "${hash}",`)
  console.log(`${filename}: ${revision} ${hash} ${size}${next === block ? " (current)" : ""}`)
  updated = updated.replace(block, next)
}

if (apply === "true") {
  await writeFile(catalogPath, updated)
  console.log(`Updated ${catalogPath}`)
} else {
  console.log("Dry run. Re-run with --apply to update the catalog.")
}
NODE
