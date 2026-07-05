import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

type QualityImpactRuleData = {
  area: string
  checks: string[]
  patterns: string[]
  risk: string
}

type QualityImpactMode =
  | { kind: 'base'; ref: string }
  | { files: string[]; kind: 'files' }
  | { kind: 'staged' }
  | { kind: 'working-tree' }

const rulesPath = new URL('../src/quality/qualityImpactRules.json', import.meta.url)
const qualityImpactRules = (
  JSON.parse(readFileSync(rulesPath, 'utf8')) as QualityImpactRuleData[]
).map((rule) => ({
  ...rule,
  patterns: rule.patterns.map((pattern) => new RegExp(pattern)),
}))

const parseMode = (args: string[]): QualityImpactMode => {
  const filesIndex = args.indexOf('--files')
  if (filesIndex >= 0) return { files: args.slice(filesIndex + 1), kind: 'files' }
  if (args.includes('--staged')) return { kind: 'staged' }

  const baseIndex = args.indexOf('--base')
  const base = baseIndex >= 0 ? args[baseIndex + 1] : null
  if (base) return { kind: 'base', ref: base }

  return { kind: 'working-tree' }
}

const changedFilesForMode = (mode: QualityImpactMode) => {
  if (mode.kind === 'files') return mode.files

  const diffArgs =
    mode.kind === 'staged'
      ? ['diff', '--cached', '--name-only']
      : mode.kind === 'base'
        ? ['diff', '--name-only', `${mode.ref}...HEAD`]
        : ['diff', '--name-only', 'HEAD']

  const files = gitLines(diffArgs)
  if (mode.kind !== 'working-tree') return files

  return Array.from(
    new Set([...files, ...gitLines(['ls-files', '--others', '--exclude-standard'])]),
  )
}

const gitLines = (args: string[]) => {
  const output = execFileSync('git', args, { encoding: 'utf8' })
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const mode = parseMode(process.argv.slice(2))
const files = changedFilesForMode(mode)

const formatQualityImpactReport = (files: string[]) => {
  const impacts = analyzeChangedFiles(files)
  if (files.length === 0) return 'No changed files detected.'
  if (impacts.length === 0) {
    return [
      'Changed files did not match a known high-risk boundary.',
      '',
      'Run the standard baseline:',
      '- pnpm exec tsc -b',
      '- pnpm lint',
      '- git diff --check',
    ].join('\n')
  }

  return impacts
    .map((impact) =>
      [
        `${impact.area}`,
        `Risk: ${impact.risk}`,
        'Matched files:',
        ...impact.files.map((file) => `- ${file}`),
        'Suggested checks:',
        ...impact.checks.map((check) => `- ${check}`),
      ].join('\n'),
    )
    .join('\n\n')
}

const analyzeChangedFiles = (files: string[]) => {
  const normalizedFiles = files.map((file) => file.trim().replaceAll('\\', '/')).filter(Boolean)

  return qualityImpactRules
    .map((rule) => {
      const matchedFiles = normalizedFiles.filter((file) =>
        rule.patterns.some((pattern) => pattern.test(file)),
      )
      return matchedFiles.length > 0 ? { ...rule, files: matchedFiles } : null
    })
    .filter((impact) => impact !== null)
}

console.log(formatQualityImpactReport(files))
