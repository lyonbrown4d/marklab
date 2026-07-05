import qualityImpactRulesData from '@/quality/qualityImpactRules.json'

export type QualityImpactArea =
  | 'Electron menu/window/preload'
  | 'Source editor / Monaco'
  | 'WYSIWYG / Milkdown'
  | 'React Flow graph'
  | 'Settings / persisted preferences'
  | 'IPC / runtime services'
  | 'Workspace filesystem/services'
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

type QualityImpactRuleData = {
  area: QualityImpactArea
  checks: string[]
  patterns: string[]
  risk: string
}

export type QualityImpact = {
  area: QualityImpactArea
  checks: string[]
  files: string[]
  risk: string
}

export const qualityImpactRules: QualityImpactRule[] = (
  qualityImpactRulesData as QualityImpactRuleData[]
).map((rule) => ({
  ...rule,
  patterns: rule.patterns.map((pattern) => new RegExp(pattern)),
}))

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
