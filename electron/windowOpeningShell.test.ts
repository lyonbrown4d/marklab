import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('window opening shell', () => {
  it('stays lightweight and exposes workspace progress plus retry', async () => {
    const html = await fs.readFile(path.join(process.cwd(), 'public/window-opening.html'), 'utf8')
    const script = await fs.readFile(path.join(process.cwd(), 'public/window-opening.js'), 'utf8')

    expect(html).toContain('role="status"')
    expect(html).toContain('data-opening-stage')
    expect(html).toContain('data-workspace-path')
    expect(html).toContain('./window-opening.js')
    expect(script).toContain('marklabElectron.opening.onProgress')
    expect(script).toContain('marklabElectron.opening.retry')
    expect(html).not.toContain('main.tsx')
    expect(html).not.toContain('monaco')
    expect(html).not.toContain('milkdown')
  })
})
