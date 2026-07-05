import { execFileSync } from 'node:child_process'

type QualityImpactRule = {
  area: string
  checks: string[]
  patterns: RegExp[]
  risk: string
}

type QualityImpactMode =
  | { kind: 'base'; ref: string }
  | { files: string[]; kind: 'files' }
  | { kind: 'staged' }
  | { kind: 'working-tree' }

const qualityImpactRules: QualityImpactRule[] = [
  {
    area: 'Electron menu/window/preload',
    risk: 'double dispatch, unsafe desktop capability, or platform-specific runtime drift',
    patterns: [/^electron\/menu/, /^electron\/main\/window/, /^electron\/preload/],
    checks: ['electron menu/window tests', 'pnpm exec tsc -b', 'pnpm lint'],
  },
  {
    area: 'Source editor / Monaco',
    risk: 'duplicated edit commands, option drift, focus routing, or source navigation regression',
    patterns: [/^src\/app\/focusedEditCommand/, /^src\/components\/MarkdownSourceEditor/],
    checks: ['source editor tests', 'focused edit tests', 'pnpm exec tsc -b'],
  },
  {
    area: 'WYSIWYG / Milkdown',
    risk: 'command mismatch, paste/drop regression, editor sync drift, or node-view breakage',
    patterns: [/^src\/components\/MarkdownEditor/, /^src\/components\/milkdown\//],
    checks: ['Milkdown command/paste/sync tests', 'pnpm exec tsc -b'],
  },
  {
    area: 'React Flow graph',
    risk: 'default node renderer fallback, drag/selection conflict, or graph model drift',
    patterns: [/^src\/components\/GraphNodes/, /^src\/logic\/graph/, /^src\/pages\/graph/],
    checks: ['graph logic tests', 'graph node tests', 'graph interaction style tests'],
  },
  {
    area: 'Settings / persisted preferences',
    risk: 'default drift, missing persisted field, inaccessible control, or migration mismatch',
    patterns: [/^electron\/services\/settings/, /^src\/components\/settings\//, /^src\/store\//],
    checks: ['settings tests', 'affected component option tests', 'pnpm exec tsc -b'],
  },
  {
    area: 'IPC / runtime services',
    risk: 'stringly payloads, broad capability exposure, or renderer/runtime contract drift',
    patterns: [/^electron\/channels/, /^electron\/ipc\//, /^electron\/preload/, /^src\/runtime\//],
    checks: ['runtime/preload/service contract tests', 'pnpm exec tsc -b'],
  },
  {
    area: 'Knowledge engine / Rust sidecar',
    risk: 'spawn/config drift, protocol mismatch, blocking work, or sidecar lifecycle regression',
    patterns: [
      /^Cargo\.(toml|lock)$/,
      /^buf\./,
      /^electron\/services\/knowledgeEngine\//,
      /^knowledge-engine\//,
    ],
    checks: [
      'cargo fmt --all --check',
      'cargo check --workspace',
      'cargo test --workspace',
      'pnpm test:knowledge:integration',
    ],
  },
  {
    area: 'Build/package',
    risk: 'missing resources, oversized bundles, asset drift, or broken package metadata',
    patterns: [/^package\.json$/, /^pnpm-lock\.yaml$/, /^resources\//, /^scripts\//, /^vite/],
    checks: [
      'pnpm exec tsc -b',
      'pnpm lint',
      'pnpm exec vite build --mode electron --logLevel error',
    ],
  },
  {
    area: 'i18n',
    risk: 'untranslated menu/settings text or renderer/native locale mismatch',
    patterns: [/^electron\/menuLocalization/, /^src\/i18n\//],
    checks: ['locale/resource tests', 'affected UI tests'],
  },
  {
    area: 'Quality gates',
    risk: 'quality checklist drift, missing boundary guard, or stale verification guidance',
    patterns: [/^docs\/quality-gates\.md$/, /^scripts\/quality-impact\.ts$/, /^src\/quality\//],
    checks: ['quality gate tests', 'pnpm quality:impact', 'pnpm lint'],
  },
]

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
