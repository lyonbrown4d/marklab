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

  it('keeps React separate from the coherent Plate editor chunk', async () => {
    const vite = await fs.readFile('vite.config.ts', 'utf8')
    const reactChunkRule = vite.indexOf("return 'vendor-react'")
    const plateChunkRule = vite.indexOf("return 'vendor-plate'")

    expect(reactChunkRule).toBeGreaterThan(-1)
    expect(plateChunkRule).toBeGreaterThan(-1)
    expect(reactChunkRule).toBeLessThan(plateChunkRule)
    expect(vite).not.toMatch(/Milkdown|milkdown|ProseMirror|prosemirror/)
  })

  it('prebundles the Plate entry points used by the editor without legacy editor entries', async () => {
    const development = await fs.readFile('vite.development.ts', 'utf8')

    expect(development).toContain("'platejs'")
    expect(development).toContain("'platejs/react'")
    expect(development).toContain("'@platejs/markdown'")
    expect(development).toContain("'@platejs/basic-nodes/react'")
    expect(development).toContain("'@platejs/list-classic'")
    expect(development).toContain("'@platejs/list-classic/react'")
    expect(development).not.toContain("'@platejs/list'")
    expect(development).not.toContain("'@platejs/list/react'")
    expect(development).not.toMatch(/Milkdown|milkdown|ProseMirror|prosemirror/)
  })

  it('prebundles and warms the lazy terminal without creating another React module graph', async () => {
    const vite = await fs.readFile('vite.config.ts', 'utf8')
    const development = await fs.readFile('vite.development.ts', 'utf8')

    expect(development).toContain("'ahooks'")
    expect(development).toContain("'@xterm/xterm'")
    expect(development).toContain("'@xterm/addon-fit'")
    expect(development).toContain("'@xterm/addon-unicode11'")
    expect(development).toContain("'@xterm/addon-web-links'")
    expect(development).toContain("'./src/components/TerminalPanel.tsx'")
    expect(vite).toContain("dedupe: ['react', 'react-dom']")
  })

  it('prebundles and warms the lazy settings dialog before its first interaction', async () => {
    const development = await fs.readFile('vite.development.ts', 'utf8')

    expect(development).toContain("'cn'")
    expect(development).toContain("'radix-ui'")
    expect(development).toContain("'lru-cache'")
    expect(development).toContain("'remark-parse'")
    expect(development).toContain("'remark-stringify'")
    expect(development).toContain("'unified'")
    expect(development).toContain("'./src/components/SettingsDialog.tsx'")
  })

  it('resolves worker-safe package exports for the Plate Markdown worker', async () => {
    const vite = await fs.readFile('vite.config.ts', 'utf8')

    expect(vite).toContain("import.meta.resolve('decode-named-character-reference')")
    expect(vite).toContain("'decode-named-character-reference': workerCharacterReferencePath")
    expect(vite).not.toContain('workerSafeMarkdownDependenciesPlugin')
  })

  it('builds Mermaid validation as a dedicated Electron worker entry', async () => {
    const electron = await fs.readFile('vite.electron.ts', 'utf8')

    expect(electron).toContain('mermaidValidationWorkerEntry')
    expect(electron).toContain('electron/services/mermaidLanguage/mermaidValidationWorkerEntry.ts')
  })
})
