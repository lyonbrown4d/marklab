import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('logo design preview build', () => {
  it('keeps HTML styling in the module build and output outside desktop artifacts', async () => {
    const root = process.cwd()
    const [html, entry, css, config, packageJson, ignore, desktopConfig] = await Promise.all(
      [
        'logo-preview.html',
        'src/design-preview/main.ts',
        'src/design-preview/logo-preview.css',
        'vite.design-preview.config.ts',
        'package.json',
        '.gitignore',
        'vite.config.ts',
      ].map((file) => readFile(path.join(root, file), 'utf8')),
    )

    expect(html).toContain('type="module" src="/src/design-preview/main.ts"')
    expect(html).not.toContain('<style>')
    expect(entry).toContain("import '@/design-preview/logo-preview.css'")
    expect(entry).not.toContain('react')
    expect(css).toContain('.theme-card.dark')
    expect(css).toContain('@media (max-width: 900px)')
    expect(config).toContain("logo: path.resolve(import.meta.dirname, 'logo-preview.html')")
    expect(config).toContain("outDir: '.tmp/design-preview'")
    expect(config).not.toContain('electron(')
    expect(ignore).toContain('.tmp/')
    expect(JSON.parse(packageJson).scripts['build:design-preview']).toBe(
      'vite build --config vite.design-preview.config.ts',
    )
    expect(desktopConfig).toContain('removeDesignPreviewAssetsPlugin')
    expect(desktopConfig).toContain('marklab-logo-direction-1.svg')
    await expect(access(path.join(root, 'public/logo-preview.html'))).rejects.toThrow()
  })
})
