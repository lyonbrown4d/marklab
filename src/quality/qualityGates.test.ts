// @ts-expect-error Vitest runs this repository guard in Node; the renderer tsconfig intentionally omits Node module types.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string
const fileExists = (file: string) => existsSync(new URL(file, import.meta.url))

const boundaryContractTests = [
  '../../electron/menu.test.ts',
  '../app/focusedEditCommand.test.ts',
  '../components/MarkdownSourceEditorSurface.test.tsx',
  '../components/settings/EditingSettingsPage.test.tsx',
  '../components/GraphNodes.test.tsx',
  '../styles/graph-interactions.test.ts',
  '../../electron/services/settingsPersistKeys.test.ts',
  '../../electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.test.ts',
] as const

describe('quality gates', () => {
  it('keeps the documented system iteration checklist discoverable', () => {
    const readme = fileText('../../README.md')
    const guide = fileText('../../docs/quality-gates.md')

    expect(readme).toContain('docs/quality-gates.md')
    expect(guide).toContain('Ownership Boundaries')
    expect(guide).toContain('Change Impact Checklist')
    expect(guide).toContain('Regression Test Rule')
    expect(guide).toContain('Desktop Smoke Checklist')
  })

  it('keeps critical boundary contract tests in the suite', () => {
    boundaryContractTests.forEach((testPath) => {
      expect(fileExists(testPath), testPath).toBe(true)
    })
  })
})
