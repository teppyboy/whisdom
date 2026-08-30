# Parakeet Archive Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept the official sherpa-onnx Parakeet archive's safe directory and unrelated file entries while extracting and verifying only the four required model assets.

**Architecture:** Keep archive safety centralized in `server/src/helper/cache.rs`. Both extraction and cached-archive verification will ignore ordinary directories and unrelated regular files, but reject unsafe entry types and paths. Required manifest files remain exact-once requirements.

**Tech Stack:** Rust, Tokio, `tar`, `bzip2`, `tempfile`, Cargo tests.

---

### Task 1: Make Parakeet archive readers tolerate safe extras

**Files:**

- Modify: `server/src/helper/cache.rs:288-465`
- Test: `server/src/helper/cache.rs` unit-test module near `altered_extracted_archive_files_are_rejected`

- [ ] **Step 1: Add the regression archive fixture test**

Extend the archive bytes in `altered_extracted_archive_files_are_rejected` or add a focused neighboring test. Build tar entries in this order:

```rust
let mut root_header = tar::Header::new_gnu();
root_header
    .set_path("sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/")
    .expect("root archive path");
root_header.set_entry_type(tar::EntryType::Directory);
root_header.set_size(0);
root_header.set_mode(0o755);
root_header.set_cksum();
tar.append(&root_header, std::io::empty()).expect("root entry");

for (name, contents) in files {
    let mut header = tar::Header::new_gnu();
    header
        .set_path(format!("sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/{name}"))
        .expect("model archive path");
    header.set_size(contents.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    tar.append(&header, contents).expect("model entry");
}

let mut test_wavs_header = tar::Header::new_gnu();
test_wavs_header
    .set_path("sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/")
    .expect("test directory path");
test_wavs_header.set_entry_type(tar::EntryType::Directory);
test_wavs_header.set_size(0);
test_wavs_header.set_mode(0o755);
test_wavs_header.set_cksum();
tar.append(&test_wavs_header, std::io::empty())
    .expect("test directory entry");

let mut extra_header = tar::Header::new_gnu();
extra_header
    .set_path("sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/en.wav")
    .expect("extra archive path");
extra_header.set_size(5);
extra_header.set_mode(0o644);
extra_header.set_cksum();
tar.append(&extra_header, b"extra")
    .expect("extra archive entry");
```

Call the production archive extraction helper and assert it succeeds. Assert the destination contains exactly the four expected files and does not contain `test_wavs`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd server && cargo test helper::cache::tests --lib
```

Expected: FAIL with `invalid model archive entry`, proving the fixture reproduces the reported archive shape.

- [ ] **Step 3: Update extraction filtering minimally**

In `extract_archive`, inspect the tar entry type before applying the required-file filter:

```rust
let entry_type = entry.header().entry_type();
if entry_type.is_dir() {
    continue;
}
if !entry_type.is_file() {
    return Err(std::io::Error::other("invalid model archive entry"));
}

let allowed = components.len() == 2
    && components[0].as_os_str() == "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
    && filename
        .is_some_and(|name| expected_files.iter().any(|expected| *expected == name));
if !allowed || found.contains(&filename) {
    continue;
}
```

Keep path validation before the skip decision: reject absolute paths and parent components. The existing two-component check rejects nested extra files by skipping them, while required files remain extracted. Preserve duplicate rejection for required files by returning an error when an allowed required filename is already in `found`; unrelated duplicates remain skipped.

- [ ] **Step 4: Apply the same policy to cached archive verification**

In `verify_extracted_files_against_archive`, use the same entry-type and path policy:

```rust
let entry_type = entry.header().entry_type();
if entry_type.is_dir() {
    continue;
}
if !entry_type.is_file() {
    return Err(std::io::Error::other("invalid model archive entry"));
}

let allowed = components.len() == 2
    && components[0].as_os_str() == "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
    && expected_files.iter().any(|expected| expected == &filename);
if !allowed {
    continue;
}
if !verified.insert(filename.clone()) {
    return Err(std::io::Error::other("invalid model archive entry"));
}
```

Compare bytes only for allowed required files. Preserve the final exact-set check so all four required assets must be verified.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
cd server && cargo test helper::cache::tests --lib
```

Expected: all cache tests pass, including the new safe-extras regression, altered extracted-file rejection, and symlink cleanup test.

- [ ] **Step 6: Run formatting and Rust validation**

Run:

```bash
cargo fmt --all -- --check
cd server && cargo test
cd server && cargo build --release
```

Expected: each command exits 0.

- [ ] **Step 7: Review the final diff**

Run:

```bash
git diff --check
git diff -- server/src/helper/cache.rs
```

Confirm only `server/src/helper/cache.rs` and the approved implementation-plan/spec files changed; no generated model assets or unrelated refactors.

- [ ] **Step 8: Commit**

```bash
git add server/src/helper/cache.rs docs/superpowers/plans/2026-08-30-parakeet-archive-extras.md
git commit -m "fix: accept safe extras in Parakeet archive"
```
