import { describe, expect, it } from 'vitest'
import {
  analyzeChangedFiles,
  formatQualityImpactReport,
  qualityImpactRules,
} from '@/quality/qualityImpact'
import qualityImpactRulesData from '@/quality/qualityImpactRules.json'

describe('quality impact rules', () => {
  it('maps changed files to the expected boundary checks', () => {
    const impacts = analyzeChangedFiles([
      'electron/menu.ts',
      'src/components/MarkdownSourceEditorSurface.tsx',
      'src/store/usePreferencesStore.ts',
      'electron/services/workspace/workspaceFileService.ts',
      'knowledge-engine/src/main.rs',
    ])

    expect(impacts.map((impact) => impact.area)).toEqual(
      expect.arrayContaining([
        'Electron menu/window/preload',
        'Source editor / Monaco',
        'Settings / persisted preferences',
        'Workspace filesystem/services',
        'Knowledge engine / Rust sidecar',
      ]),
    )
    expect(impacts.find((impact) => impact.area === 'Source editor / Monaco')?.checks).toContain(
      'source editor tests',
    )
    expect(
      impacts.find((impact) => impact.area === 'Knowledge engine / Rust sidecar')?.checks,
    ).toContain('cargo test --workspace')
    expect(
      impacts.find((impact) => impact.area === 'Workspace filesystem/services')?.checks,
    ).toContain('workspace service tests')
  })

  it('flags quality gate changes as their own impact area', () => {
    const impacts = analyzeChangedFiles(['docs/quality-gates.md', 'scripts/quality-impact.ts'])

    expect(impacts.map((impact) => impact.area)).toContain('Quality gates')
    expect(impacts.find((impact) => impact.area === 'Quality gates')?.checks).toContain(
      'pnpm quality:impact',
    )
  })

  it('flags project automation changes as build/package impact', () => {
    const impacts = analyzeChangedFiles(['moon.yml', '.github/workflows/release.yml'])

    expect(impacts.map((impact) => impact.area)).toContain('Build/package')
  })

  it('compiles the shared rule data into runtime matchers', () => {
    expect(qualityImpactRules).toHaveLength(qualityImpactRulesData.length)
    expect(
      qualityImpactRules.every((rule) =>
        rule.patterns.every((pattern) => pattern instanceof RegExp),
      ),
    ).toBe(true)
  })

  it('normalizes Windows-style paths before matching rules', () => {
    const impacts = analyzeChangedFiles(['src\\pages\\graph\\GraphToolbar.tsx'])

    expect(impacts.map((impact) => impact.area)).toContain('React Flow graph')
  })

  it('prints a standard fallback for low-risk unmatched changes', () => {
    const report = formatQualityImpactReport(['docs/notes.md'])

    expect(report).toContain('Changed files did not match a known high-risk boundary.')
    expect(report).toContain('pnpm exec tsc -b')
    expect(report).toContain('git diff --check')
  })

  it('prints a quiet message when there are no changed files', () => {
    expect(formatQualityImpactReport([])).toBe('No changed files detected.')
  })
})
