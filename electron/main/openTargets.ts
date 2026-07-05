import fs from 'node:fs/promises'
import path from 'node:path'

const isOpenTargetCandidate = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('-')) return false
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol) return false
  } catch {
    return true
  }
  return true
}

export const collectOpenTargetCandidates = (values: readonly unknown[], cwd: string): string[] => {
  const targets: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (typeof value !== 'string' || !isOpenTargetCandidate(value)) continue
    const resolved = path.resolve(cwd || '.', value)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    targets.push(resolved)
  }

  return targets
}

export const resolveExistingOpenTargets = async (
  values: readonly unknown[],
  cwd: string,
): Promise<string[]> => {
  const targets: string[] = []

  for (const candidate of collectOpenTargetCandidates(values, cwd)) {
    const stat = await fs.stat(candidate).catch(() => null)
    if (stat?.isFile() || stat?.isDirectory()) targets.push(candidate)
  }

  return targets
}
