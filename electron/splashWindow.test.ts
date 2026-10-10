import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('startup splash window', () => {
  it('is a dedicated Vite entry backed by the shared component library', async () => {
    const root = process.cwd()
    const entryPath = path.join(root, 'splashscreen.html')
    const componentPath = path.join(root, 'src/splash/SplashScreen.tsx')
    const stylesheetPath = path.join(root, 'src/splash/splash.scss')
    const buildConfigPath = path.join(root, 'vite.splash.config.ts')
    const buildScriptPath = path.join(root, 'scripts/build-electron.ts')
    const requiredPaths = [
      entryPath,
      componentPath,
      stylesheetPath,
      buildConfigPath,
      buildScriptPath,
    ]
    const missingPaths = (
      await Promise.all(
        requiredPaths.map(async (filePath) =>
          fs
            .access(filePath)
            .then(() => null)
            .catch(() => filePath),
        ),
      )
    ).filter((filePath): filePath is string => filePath !== null)

    expect(missingPaths).toEqual([])

    const [html, component, stylesheet, buildConfig, buildScript] = await Promise.all([
      fs.readFile(entryPath, 'utf8'),
      fs.readFile(componentPath, 'utf8'),
      fs.readFile(stylesheetPath, 'utf8'),
      fs.readFile(buildConfigPath, 'utf8'),
      fs.readFile(buildScriptPath, 'utf8'),
    ])
    expect(html).toContain('/src/splash/main.tsx')
    expect(component).toContain("from '@/components/ui/card'")
    expect(component).toContain("from '@/components/ui/skeleton'")
    expect(component).toContain('data-splash-document')
    expect(component).toContain('role="status"')
    expect(component).toContain('aria-live="polite"')
    expect(stylesheet).toContain('prefers-color-scheme: dark')
    expect(stylesheet).toContain('prefers-reduced-motion: reduce')
    expect(stylesheet).toContain("@import 'tailwindcss' source(none)")
    expect(buildConfig).toContain("input: path.resolve(import.meta.dirname, 'splashscreen.html')")
    expect(buildConfig).toContain('emptyOutDir: false')
    expect(buildScript).toContain("configFile: 'vite.splash.config.ts'")
    expect(component).not.toContain('monaco')
    expect(component).not.toContain('platejs')
  })
})
