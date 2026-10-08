import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (relativePath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

describe('native app icon assets', () => {
  it('gives both color modes an opaque high-contrast tile', () => {
    const lightIcon = readProjectFile('resources/icon-sources/marklab-light.svg')
    const darkIcon = readProjectFile('resources/icon-sources/marklab-dark.svg')

    expect(lightIcon).toMatch(/<rect[^>]+fill="#F8FAFC"/)
    expect(lightIcon).toMatch(/<rect[^>]+stroke="#CBD5E1"/)
    expect(darkIcon).toMatch(/<rect[^>]+fill="#0F172A"/)
    expect(darkIcon).toMatch(/<rect[^>]+stroke="#334155"/)
  })

  it('keeps in-app logos transparent', () => {
    expect(readProjectFile('public/marklab-light.svg')).not.toContain('<rect')
    expect(readProjectFile('public/marklab-dark.svg')).not.toContain('<rect')
  })

  it('generates dedicated native light and dark icon containers', () => {
    const generator = readProjectFile('scripts/generate-app-icons.ts')

    expect(generator).toContain("'marklab-light.svg'")
    expect(generator).toContain("'marklab-dark.svg'")
    expect(generator).toContain("'marklab-light.ico'")
    expect(generator).toContain("'marklab-dark.ico'")
  })

  it('applies the native icon to the Windows taskbar relaunch entry', () => {
    const windowSource = readProjectFile('electron/window.ts')

    expect(windowSource).toContain('configureWindowAppIdentity(main, windowsTaskbarIconPath)')
  })
})
