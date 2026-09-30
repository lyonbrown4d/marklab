import { describe, expect, it, vi } from 'vitest'
import { renderDocx } from '@electron/services/export/docx.js'

describe('renderDocx local images', () => {
  it('embeds a relative image returned by the workspace reader', async () => {
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const readImage = vi.fn(async () => imageBytes)

    const result = await renderDocx('![architecture](images/flow.png)', { readImage })

    expect(result.length).toBeGreaterThan(0)
    expect(readImage).toHaveBeenCalledWith('images/flow.png')
  })

  it('delegates parent-relative workspace paths to the workspace reader', async () => {
    const readImage = vi.fn(async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    await renderDocx('![architecture](../assets/flow.png)', { readImage })

    expect(readImage).toHaveBeenCalledWith('../assets/flow.png')
  })

  it('does not ask the workspace reader for external or absolute images', async () => {
    const readImage = vi.fn(async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    await renderDocx('![remote](https://example.com/a.png)\n\n![absolute](C:/secrets/a.png)', {
      readImage,
    })

    expect(readImage).not.toHaveBeenCalled()
  })

  it('omits an image when the workspace reader rejects it', async () => {
    const readImage = vi.fn(async () => null)

    const result = await renderDocx('![secret](../../secret.png)', { readImage })

    expect(result.length).toBeGreaterThan(0)
    expect(readImage).toHaveBeenCalledWith('../../secret.png')
  })
})
