import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  cancel: vi.fn().mockResolvedValue(undefined),
  capture: vi.fn(),
  fetch: vi.fn(),
  promote: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/runtime/desktop', () => ({ getDesktopRuntime: () => ({ linkPreview: runtime }) }))
import { linkPreviewApi } from '@/services/linkPreviewApi'

const deferred = () => {
  let resolve!: (value: unknown) => void
  let reject!: (error: Error) => void
  const promise = new Promise((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, reject, resolve }
}

describe('link preview demand adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards demand immediately with a unique typed ID and forwards promotion', async () => {
    const capture = deferred()
    runtime.capture.mockReturnValueOnce(capture.promise)
    const result = linkPreviewApi.capture('https://example.com/', { priority: 'background' })
    const options = runtime.capture.mock.calls[0]?.[1]
    expect(options).toEqual({ priority: 'background', requestId: expect.any(String) })
    await linkPreviewApi.promote('https://example.com/')
    expect(runtime.promote).toHaveBeenCalledWith(options.requestId)
    capture.resolve({ src: 'snapshot' })
    expect(await result).toEqual({ src: 'snapshot' })
    await linkPreviewApi.promote('https://example.com/')
    expect(runtime.promote).toHaveBeenCalledTimes(1)
  })

  it('cancels each demand subscriber and detaches after a rejected capture', async () => {
    const first = deferred()
    const second = deferred()
    runtime.capture.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const one = linkPreviewApi.capture('https://example.com/')
    const two = linkPreviewApi.capture('https://example.com/')
    const ids = runtime.capture.mock.calls.map(([, options]) => options.requestId)
    expect(new Set(ids).size).toBe(2)
    await linkPreviewApi.cancel('https://example.com/')
    expect(runtime.cancel.mock.calls.map(([id]) => id)).toEqual(ids)
    first.reject(new Error('cancelled'))
    second.resolve({ src: 'snapshot' })
    await expect(one).rejects.toThrow('cancelled')
    await two
    await linkPreviewApi.cancel('https://example.com/')
    expect(runtime.cancel).toHaveBeenCalledTimes(2)
  })

  it('forwards AbortSignal cancellation and rejects already aborted demand without IPC', async () => {
    const controller = new AbortController()
    const pending = deferred()
    runtime.capture.mockReturnValueOnce(pending.promise)
    const result = linkPreviewApi.capture('https://example.com/', { signal: controller.signal })
    controller.abort()
    expect(runtime.cancel).toHaveBeenCalledWith(runtime.capture.mock.calls[0]?.[1].requestId)
    pending.reject(new Error('cancelled'))
    await expect(result).rejects.toThrow('cancelled')
    await expect(
      linkPreviewApi.capture('https://example.com/', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'PREVIEW_CANCELLED' })
    expect(runtime.capture).toHaveBeenCalledTimes(1)
  })
})
