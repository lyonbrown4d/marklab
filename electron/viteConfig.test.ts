import fs from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

describe('Vite production configuration', () => {
  it('keeps development diagnostics and duplicate generated assets out of production', async () => {
    const vite = await fs.readFile('vite.config.ts', 'utf8')
    const reactScan = await fs.readFile('src/dev/reactScan.ts', 'utf8')

    expect(reactScan).toMatch(/if \(!import\.meta\.env\.DEV\) return[\s\S]*import\('react-scan'\)/)
    expect(vite).not.toContain('productionReactScanStubPlugin')
    expect(vite).not.toContain('copyKatexFontsPlugin')
    expect(vite).not.toContain('distKatexFontsDir')
    expect(vite).not.toContain('vite-plugin-compression2')
    expect(vite).not.toContain('shouldCompress')
    expect(vite).not.toContain("mode === 'compressed'")
  })

  it('keeps shared lodash code out of the broader Milkdown chunk', async () => {
    const vite = await fs.readFile('vite.config.ts', 'utf8')
    const lodashChunkRule = vite.indexOf("return 'vendor-lodash'")
    const milkdownChunkRule = vite.indexOf("return 'vendor-milkdown-core'")

    expect(lodashChunkRule).toBeGreaterThan(-1)
    expect(lodashChunkRule).toBeLessThan(milkdownChunkRule)
  })
})
