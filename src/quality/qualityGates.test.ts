import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import qualityImpactRulesData from '@/quality/qualityImpactRules.json'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string
const fileExists = (file: string) => existsSync(new URL(file, import.meta.url))

const boundaryContractTests = [
  '../runtime/tauri/transport.test.ts',
  '../runtime/tauri/index.test.ts',
  '../app/focusedEditCommand.test.ts',
  '../components/SourceCodeEditorSurface.test.tsx',
  '../components/settings/EditingSettingsPage.test.tsx',
  '../pages/WorkspaceGraphPage.test.tsx',
  './i18nResourceBoundary.test.ts',
  './shortcutBoundary.test.ts',
  './settingsPersistBoundary.test.ts',
  '../styles/graph-interactions.test.ts',
  '../app/AppCachedOutlet.render.test.tsx',
  '../app/AppCachedOutlet.policy.test.tsx',
  '../app/scheduleEditorRuntimePreload.test.ts',
  '../services/boundedWorkerPool.test.ts',
  '../components/markdownSourceCompletion.isolation.test.ts',
  '../components/previews/SourcePreviewSurface.test.tsx',
  '../components/previews/PdfPreviewSurface.test.tsx',
  '../components/previews/DocxPreviewSurface.test.tsx',
  '../components/previews/DrawioEditorSurface.test.tsx',
  '../components/previews/ExcalidrawEditorSurface.test.tsx',
  '../../e2e/renderer/workspace-isolation.spec.ts',
  '../../e2e/renderer/editor-integrations.spec.ts',
  '../../src-tauri/src/settings/tests.rs',
  '../../src-tauri/src/analysis/cache_tests.rs',
  '../../src-tauri/src/workspace/shared_tests.rs',
  '../../src-tauri/src/workspace/lifecycle_tests.rs',
  '../../src-tauri/src/workspace/event_tests.rs',
] as const

describe('quality gates', () => {
  it('keeps the documented system iteration checklist discoverable', () => {
    const readme = fileText('../../README.md')
    const guide = fileText('../../docs/quality-gates.md')

    expect(readme).toContain('docs/quality-gates.md')
    expect(guide).toContain('pnpm quality:impact')
    expect(guide).toContain('pnpm check')
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

  it('documents every quality impact area', () => {
    const guide = fileText('../../docs/quality-gates.md')

    qualityImpactRulesData.forEach((rule) => {
      expect(guide).toContain(rule.area)
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
    expect(fileExists('./qualityImpactRules.json')).toBe(true)
  })

  it('keeps source line limits enforced with only the downloaded shadcn sidebar exempted', () => {
    const packageJson = JSON.parse(fileText('../../package.json')) as {
      scripts?: Record<string, string>
    }
    const lineLimitScript = fileText('../../scripts/check-source-line-limits.ts')
    const guide = fileText('../../docs/quality-gates.md')

    expect(packageJson.scripts?.['quality:line-limits']).toBe(
      'node --experimental-strip-types scripts/check-source-line-limits.ts',
    )
    expect(lineLimitScript).toContain("'src/components/ui/sidebar.tsx'")
    expect(lineLimitScript).toContain('MAX_EFFECTIVE_LINES = 300')
    expect(lineLimitScript).toContain('filter((line) => line.trim().length > 0)')
    expect(lineLimitScript).toContain("ROOT_SOURCE_DIRECTORY = '.'")
    expect(lineLimitScript).toContain('collectRootSourceFiles()')
    expect(lineLimitScript).toContain('entry.isFile()')
    expect(lineLimitScript).toContain('...collectRootSourceFiles()')
    expect(guide).toContain('root-level tooling and configuration files')
  })

  it('keeps critical editor integrations behind an 85 percent coverage gate', () => {
    const packageJson = JSON.parse(fileText('../../package.json')) as {
      scripts?: Record<string, string>
    }
    const viteConfig = fileText('../../vite.config.ts')

    expect(packageJson.scripts?.['test:coverage:critical']).toBe(
      'vitest run --coverage --maxWorkers=2',
    )
    expect(viteConfig).toContain("provider: 'v8'")
    expect(viteConfig).toContain('perFile: true')
    expect(viteConfig).toContain('lines: 85')
    expect(viteConfig).toContain('functions: 85')
    expect(viteConfig).toContain('statements: 85')
    expect(viteConfig).toContain('branches: 85')
    const coverageInclude = viteConfig.match(/coverage:\s*\{[\s\S]*?include:\s*\[([\s\S]*?)\]/)
    expect(coverageInclude).not.toBeNull()
    const files = Array.from(coverageInclude?.[1].matchAll(/'([^']+)'/g) ?? [], (match) => match[1])
    expect(files.sort()).toEqual(
      [
        'src/runtime/desktop.ts',
        'src/runtime/rendererFrame.ts',
        'src/runtime/rendererLifecycle.ts',
        'src/runtime/tauri/index.ts',
        'src/runtime/tauri/transport.ts',
        'src/runtime/tauri/window.ts',
        'src/app/nativeSurfaceOcclusion.ts',
        'src/components/command/useDoubleShiftCommandPalette.ts',
        'src/components/plate/nodes/MathFootnoteElements.tsx',
        'src/components/plate/plateMarkdownConfig.ts',
        'src/components/plate/plateMarkdownInputRuleGuard.ts',
        'src/components/plate/plateMarkdownInputRules.ts',
        'src/components/plate/plateMarkdownWorkerConfig.ts',
        'src/components/plate/plateMarkdownWorkerRuntime.ts',
        'src/components/plate/selection/PlateSelectionToolbar.tsx',
        'src/components/plate/selection/selectionToolbarActions.ts',
        'src/components/plate/usePlateSelectionToolbar.ts',
        'src/pages/workspace-map/WorkspaceMapFileNode.tsx',
        'src/pages/workspace-map/WorkspaceMapStaticMarkdownPreview.tsx',
        'src/workers/plateMarkdownWorker.ts',
        'vite.worker.ts',
        'vite.workerPlateTransforms.ts',
      ].sort(),
    )
    expect(fileText('../../moon.yml')).toContain('command: pnpm test:coverage:critical')
  })

  it('keeps the project-level check wired to quality impact', () => {
    const moonConfig = fileText('../../moon.yml')
    const releaseWorkflow = fileText('../../.github/workflows/release.yml')

    expect(moonConfig).toContain('quality-impact:')
    expect(moonConfig).toContain('command: pnpm quality:impact')
    expect(moonConfig).toContain('- ~:quality-impact')
    expect(moonConfig).toContain('quality-line-limits:')
    expect(moonConfig).toContain('command: pnpm quality:line-limits')
    expect(moonConfig).toContain('- ~:quality-line-limits')
    expect(releaseWorkflow).toContain('run: pnpm check')
    expect(releaseWorkflow).toContain('run: pnpm test:renderer:e2e')
    expect(releaseWorkflow).toContain('name: renderer-release-regressions')
  })

  it('builds the production renderer once before the focused Chromium smoke gate', () => {
    const packageJson = JSON.parse(fileText('../../package.json')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts['test:renderer:e2e']).toBe(
      'pnpm build:renderer && pnpm test:renderer:e2e:run',
    )
    expect(packageJson.scripts['test:renderer:e2e:run']).toBe(
      'pnpm exec playwright test --config playwright.renderer.config.ts --project smoke',
    )
    expect(packageJson.scripts['test:integration']).toContain('pnpm tauri:test')
    expect(packageJson.scripts['test:integration']).toContain('pnpm test:renderer:e2e')
  })

  it('keeps Chromium deterministic and preserves failure evidence plus separate native tests', () => {
    const config = fileText('../../playwright.renderer.config.ts')
    const nativeWorkflow = fileText('../../.github/workflows/native.yml')
    expect(config).toMatch(/forbidOnly:\s*(Boolean\(process.env.CI\)|!!process.env.CI)/)
    expect(config).toContain('retries: 0')
    expect(config).toContain('workers: 1')
    expect(config).toContain("screenshot: 'only-on-failure'")
    expect(config).toContain("trace: 'retain-on-failure'")
    expect(config).toContain('test-results/renderer')
    expect(nativeWorkflow).toContain('cargo test --manifest-path src-tauri/Cargo.toml')
    expect(nativeWorkflow).toContain('--lib --locked')
    expect(nativeWorkflow).toContain('--all-targets --locked -- -D warnings')
  })

  it('keeps the change impact CLI backed by the shared rule data', () => {
    const script = fileText('../../scripts/quality-impact.ts')

    expect(script).toContain('../src/quality/qualityImpactRules.json')
    expect(script).not.toContain('const qualityImpactRules: QualityImpactRule[] = [')
  })

  it('reports impact areas for explicit file lists', () => {
    const output = execFileSync(
      'node',
      [
        '--experimental-strip-types',
        'scripts/quality-impact.ts',
        '--files',
        'src-tauri/src/desktop/menus.rs',
        'src/components/SourceCodeEditorSurface.tsx',
        'docs/quality-gates.md',
      ],
      {
        encoding: 'utf8',
      },
    )

    expect(output).toContain('Native menus / windows')
    expect(output).toContain('Source editor / Monaco')
    expect(output).toContain('Quality gates')
  })
})
