import { describe, expect, it, vi } from 'vitest'
import { renderHtmlWithLocalImages } from '@electron/services/export/html'

describe('renderHtml export resources', () => {
  it('embeds a relative image returned by the workspace reader', async () => {
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const readImage = vi.fn(async () => imageBytes)

    const html = await renderHtmlWithLocalImages('![diagram](images/flow.png)', {
      readImage,
      resourceBasePath: 'D:/notes/docs',
      resolveRelativeResources: true,
    })

    expect(html).toContain(`src="data:image/png;base64,${imageBytes.toString('base64')}"`)
    expect(html).not.toContain('file:///')
    expect(readImage).toHaveBeenCalledWith('images/flow.png')
  })

  it('blocks an image rejected by the workspace reader', async () => {
    const readImage = vi.fn(async () => null)
    const html = await renderHtmlWithLocalImages('![secret](../../secret.png)', {
      readImage,
      resourceBasePath: 'D:/notes/docs',
      resolveRelativeResources: true,
    })

    expect(html).toContain('src="#"')
    expect(html).not.toContain('secret.png')
    expect(readImage).toHaveBeenCalledWith('../../secret.png')
  })
})
