import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('standby renderer bundle boundary', () => {
  it('defers the full workspace application until the standby window is activated', async () => {
    const source = await fs.readFile(path.join(process.cwd(), 'src/main.tsx'), 'utf8')

    expect(source).not.toMatch(/import App from ['"]@\/App/)
    expect(source).not.toMatch(/import \{ PlateDndProvider \} from/)
    expect(source).toContain("import('@/app/RendererApplication')")
  })
})
