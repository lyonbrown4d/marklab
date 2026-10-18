import { describe, expect, it, vi, afterEach } from 'vitest'

import { createNativePdfRange } from '@/components/previews/nativePdfRange'

vi.mock('react-pdf', () => ({
  pdfjs: {
    PDFDataRangeTransport: class {
      onDataRange = vi.fn()
      length: number
      initialData: Uint8Array
      constructor(length: number, initialData: Uint8Array) {
        this.length = length
        this.initialData = initialData
      }
    },
  },
}))

afterEach(() => vi.unstubAllGlobals())

describe('native PDF range transport', () => {
  it('opens a large PDF with metadata and bounded chunks, then seeks without full reads', async () => {
    const length = 512 * 1024 * 1024
    const requests: RequestInit[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, request: RequestInit) => {
        requests.push(request)
        if (request.method === 'HEAD')
          return new Response(null, { headers: { 'content-length': String(length) } })
        const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(request.headers).get('range') ?? '')!
        const [begin, end] = [Number(match[1]), Number(match[2])]
        return new Response(new Uint8Array(end - begin + 1), {
          status: 206,
          headers: { 'content-range': `bytes ${begin}-${end}/${length}` },
        })
      }),
    )
    const controller = new AbortController()
    const failed = vi.fn()
    const range = await createNativePdfRange(
      'marklab-asset://local/v1/test',
      controller.signal,
      failed,
    )
    expect(range.length).toBe(length)
    expect(range.initialData?.length).toBe(256 * 1024)
    const delivered = vi.spyOn(range, 'onDataRange')
    range.requestDataRange(length - 512 * 1024, length)
    await vi.waitFor(() => expect(requests).toHaveLength(4))
    await vi.waitFor(() => expect(delivered).toHaveBeenCalledOnce())
    expect(delivered).toHaveBeenCalledWith(length - 512 * 1024, new Uint8Array(512 * 1024))
    expect(failed).not.toHaveBeenCalled()
    expect(
      requests.every(
        (request) => request.method === 'HEAD' || new Headers(request.headers).has('range'),
      ),
    ).toBe(true)
    range.abort()
  })

  it('rejects a server that ignores the range header instead of loading the entire file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, request: RequestInit) =>
        request.method === 'HEAD'
          ? new Response(null, { headers: { 'content-length': '1000' } })
          : new Response(new Uint8Array(1000)),
      ),
    )
    await expect(
      createNativePdfRange('marklab-asset://local/v1/test', new AbortController().signal, vi.fn()),
    ).rejects.toThrow('range response')
  })
})
