# Parakeet Archive Extras Design

## Goal

Allow the official sherpa-onnx Parakeet archive to install while preserving strict archive path and file-type safety.

## Root Cause

`server/src/helper/cache.rs` currently treats every tar entry as one of the four required model files. The official archive also contains directory entries and `test_wavs/*`, so extraction fails with `invalid model archive entry` before the required assets are written.

## Design

Update both archive-reading paths:

- `extract_archive`: skip safe directory entries and unrelated regular files; extract only manifest-listed files.
- `verify_extracted_files_against_archive`: skip safe directory entries and unrelated regular files; compare only manifest-listed files.
- Reject absolute paths, traversal paths, symlinks, hardlinks, device entries, and duplicate required files.
- Continue requiring every manifest-listed file exactly once.

Safe extras are ignored rather than extracted. This avoids storing test WAVs and remains compatible with future archives that add ordinary metadata/assets.

## Testing

Add a regression fixture/archive containing:

- the expected four files;
- the root model directory;
- a `test_wavs/` directory;
- an unrelated regular WAV entry.

Assert extraction succeeds and only the four required files are present. Keep existing altered-file and symlink rejection tests passing.

## Scope

Only `server/src/helper/cache.rs` and its unit tests change. No model manifest or runtime changes are needed.
