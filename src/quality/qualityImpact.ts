export type QualityImpactArea =
  | 'Electron menu/window/preload'
  | 'Source editor / Monaco'
  | 'WYSIWYG / Milkdown'
  | 'React Flow graph'
  | 'Settings / persisted preferences'
  | 'IPC / runtime services'
  | 'Knowledge engine / Rust sidecar'
  | 'Build/package'
  | 'i18n'
  | 'Quality gates'

export type QualityImpactRule = {
  area: QualityImpactArea
  checks: string[]
  patterns: RegExp[]
  risk: string
}

export type QualityImpact = {
  area: QualityImpactArea
  checks: string[]
  files: string[]
  risk: string
}

export const qualityImpactRules: QualityImpactRule[] = [
  {
    area: 'Electron menu/window/preload',
    risk: 'double dispatch, unsafe desktop capability, or platform-specific runtime drift',
    patterns: [
      /^electron\/menu/,
      /^electron\/main\/window/,
      /^electron\/preload/,
      /^electron\/services\/menuDispatch/,
      /^src\/app\/useAppMenuAction/,
      /^src\/components\/WindowControls/,
    ],
    checks: ['electron menu/window tests', 'pnpm exec tsc -b', 'pnpm lint'],
  },
  {
    area: 'Source editor / Monaco',
    risk: 'duplicated edit commands, option drift, focus routing, or source navigation regression',
    patterns: [
      /^src\/app\/focusedEditCommand/,
      /^src\/components\/MarkdownSourceEditor/,
      /^src\/components\/markdownSource/,
      /^src\/lib\/focusedCodeEditor/,
      /^src\/pages\/Source/,
    ],
    checks: ['source editor tests', 'focused edit tests', 'pnpm exec tsc -b'],
  },
  {
    area: 'WYSIWYG / Milkdown',
    risk: 'command mismatch, paste/drop regression, editor sync drift, or node-view breakage',
    patterns: [
      /^src\/components\/MarkdownEditor/,
      /^src\/components\/milkdown\//,
      /^src\/components\/markdown\//,
      /^src\/styles\/editor/,
    ],
    checks: ['Milkdown command/paste/sync tests', 'pnpm exec tsc -b'],
  },
  {
    area: 'React Flow graph',
    risk: 'default node renderer fallback, drag/selection conflict, or graph model drift',
    patterns: [
      /^src\/components\/GraphNodes/,
      /^src\/logic\/graph/,
      /^src\/pages\/GraphPage/,
      /^src\/pages\/graph/,
      /^src\/styles\/app\/_graph/,
      /^src\/styles\/graph/,
    ],
    checks: ['graph logic tests', 'graph node tests', 'graph interaction style tests'],
  },
  {
    area: 'Settings / persisted preferences',
    risk: 'default drift, missing persisted field, inaccessible control, or migration mismatch',
    patterns: [
      /^electron\/services\/settings/,
      /^src\/components\/settings\//,
      /^src\/components\/SettingsDialog/,
      /^src\/store\/preferences/,
      /^src\/store\/usePreferencesStore/,
    ],
    checks: ['settings tests', 'affected component option tests', 'pnpm exec tsc -b'],
  },
  {
    area: 'IPC / runtime services',
    risk: 'stringly payloads, broad capability exposure, or renderer/runtime contract drift',
    patterns: [
      /^electron\/channels/,
      /^electron\/ipc\//,
      /^electron\/preload/,
      /^src\/runtime\//,
      /^src\/services\/.+Api/,
    ],
    checks: ['runtime/preload/service contract tests', 'pnpm exec tsc -b'],
  },
  {
    area: 'Knowledge engine / Rust sidecar',
    risk: 'spawn/config drift, protocol mismatch, blocking work, or sidecar lifecycle regression',
    patterns: [
      /^Cargo\.(toml|lock)$/,
      /^buf\./,
      /^electron\/generated\/knowledge-engine\//,
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
    patterns: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^resources\//,
      /^scripts\//,
      /^vite/,
      /^tsconfig/,
    ],
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

export const analyzeChangedFiles = (files: string[]) => {
  const normalizedFiles = files.map(normalizePath).filter(Boolean)

  return qualityImpactRules
    .map((rule): QualityImpact | null => {
      const matchedFiles = normalizedFiles.filter((file) =>
        rule.patterns.some((pattern) => pattern.test(file)),
      )
      if (matchedFiles.length === 0) return null
      return {
        area: rule.area,
        checks: rule.checks,
        files: matchedFiles,
        risk: rule.risk,
      }
    })
    .filter((impact): impact is QualityImpact => Boolean(impact))
}

export const formatQualityImpactReport = (files: string[]) => {
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

const normalizePath = (file: string) => file.trim().replaceAll('\\', '/')
