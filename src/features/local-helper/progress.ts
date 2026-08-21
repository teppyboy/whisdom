export function normalizeHelperProgress(progress: number | undefined) {
  return Math.min(1, Math.max(0, (progress ?? 0) / 100))
}
