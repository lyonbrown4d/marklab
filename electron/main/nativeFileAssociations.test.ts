import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('native Markdown file associations', () => {
  it('registers Markdown extensions and Linux MIME types in packaged builds', async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      build?: {
        fileAssociations?: Array<{ ext?: string[]; mimeType?: string; role?: string }>
        linux?: { mimeTypes?: string[] }
      }
    }

    expect(packageJson.build?.fileAssociations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ext: expect.arrayContaining(['md', 'markdown']),
          mimeType: 'text/markdown',
          role: 'Editor',
        }),
      ]),
    )
    expect(packageJson.build?.linux?.mimeTypes).toEqual(
      expect.arrayContaining(['text/markdown', 'text/x-markdown']),
    )
  })

  it('embeds the Marklab icon into Windows executables used by shortcuts', async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      build?: {
        win?: { icon?: string; signAndEditExecutable?: boolean }
      }
    }

    expect(packageJson.build?.win).toMatchObject({
      icon: 'resources/icons/marklab.ico',
      signAndEditExecutable: true,
    })
  })
})
