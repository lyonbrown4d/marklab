import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('window opening shell', () => {
  it('stays lightweight and exposes workspace progress plus retry', async () => {
    const html = await fs.readFile(path.join(process.cwd(), 'window-opening.html'), 'utf8')
    const script = await fs.readFile(path.join(process.cwd(), 'src/opening/main.tsx'), 'utf8')
    const component = await fs.readFile(
      path.join(process.cwd(), 'src/components/loading/WorkspaceOpeningSurface.tsx'),
      'utf8',
    )

    expect(html).toContain('/src/opening/main.tsx')
    expect(component).toContain('role=')
    expect(component).toContain('opening.onProgress')
    expect(component).toContain('opening.retry')
    expect(script).toContain('window.onCloseRequested')
    expect(html).not.toContain('/src/main.tsx')
    expect(html).not.toContain('monaco')
    expect(html).not.toContain('milkdown')
  })
})
