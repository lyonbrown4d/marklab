import { describe, expect, it, vi } from 'vitest'
import { htmlPreviewApi, MAX_HTML_PREVIEW_BYTES } from '@/services/htmlPreviewApi'
import { invoke } from '@/runtime/ipc'

// Native responses stay unknown so malformed-payload cases exercise runtime validation.
const nativeIpc = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/runtime/ipc', () => nativeIpc)

describe('htmlPreviewApi', () => {
  it('returns validated native document content and rejects malformed results', async () => {
    nativeIpc.invoke
      .mockResolvedValueOnce({ document: '<p>Prepared</p>' })
      .mockResolvedValueOnce({ document: 3 })
    expect(await htmlPreviewApi.render('<p>Source</p>', new AbortController().signal)).toBe(
      '<p>Prepared</p>',
    )
    await expect(htmlPreviewApi.render('text', new AbortController().signal)).rejects.toThrow()
  })

  it('bounds input by UTF-8 bytes and ignores completed work after cancellation', async () => {
    nativeIpc.invoke.mockClear()
    await expect(
      htmlPreviewApi.render('中'.repeat(MAX_HTML_PREVIEW_BYTES / 2), new AbortController().signal),
    ).rejects.toThrow('512 KiB')
    expect(invoke).not.toHaveBeenCalled()
    const controller = new AbortController()
    nativeIpc.invoke.mockImplementationOnce(async () => {
      controller.abort()
      return { document: '<p>Stale</p>' }
    })
    await expect(htmlPreviewApi.render('text', controller.signal)).rejects.toThrow()
  })
})
