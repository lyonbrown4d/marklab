// @ts-expect-error Vitest runs this repository guard in Node; the renderer tsconfig intentionally omits Node module types.
import { execFileSync } from 'node:child_process'
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
    expect(guide).toContain('pnpm quality:impact')
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

  it('keeps the change impact helper wired into package scripts', () => {
    const packageJson = JSON.parse(fileText('../../package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['quality:impact']).toBe(
      'node --experimental-strip-types scripts/quality-impact.ts',
    )
    expect(fileExists('../../scripts/quality-impact.ts')).toBe(true)
  })

  it('reports impact areas for explicit file lists', () => {
    const output = execFileSync(
      'node',
      [
        '--experimental-strip-types',
        'scripts/quality-impact.ts',
        '--files',
        'electron/menu.ts',
        'src/components/MarkdownSourceEditorSurface.tsx',
        'docs/quality-gates.md',
      ],
      {
        encoding: 'utf8',
      },
    )

    expect(output).toContain('Electron menu/window/preload')
    expect(output).toContain('Source editor / Monaco')
    expect(output).toContain('Quality gates')
  })
})
