import { pdfjs } from 'react-pdf'

import { toWebviewAssetUrl } from '@/runtime/assetUrl'

const CHUNK_SIZE = 256 * 1024
const MAX_RANGE_BYTES = 128 * 1024 * 1024

// Tauri custom protocols return an owned response body. Use PDF.js' native
// range transport so a large local PDF never becomes one native allocation.
export const createNativePdfRange = async (
  url: string,
  signal: AbortSignal,
  onFailure: () => void,
) => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const source = toWebviewAssetUrl(url)
  try {
    const head = await fetch(source, { method: 'HEAD', signal: controller.signal })
    const length = Number(head.headers.get('content-length'))
    if (!head.ok || !Number.isSafeInteger(length) || length <= 0) {
      throw new Error('PDF size is unavailable')
    }
    const read = async (begin: number, end: number) => {
      const response = await fetch(source, {
        headers: { Range: `bytes=${begin}-${end - 1}` },
        signal: controller.signal,
      })
      if (
        response.status !== 206 ||
        response.headers.get('content-range') !== `bytes ${begin}-${end - 1}/${length}`
      ) {
        throw new Error('PDF range response is invalid')
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length !== end - begin) throw new Error('PDF changed while reading')
      return bytes
    }
    const initial = await read(0, Math.min(CHUNK_SIZE, length))
    class NativePdfRange extends pdfjs.PDFDataRangeTransport {
      private pending = Promise.resolve()

      override requestDataRange(begin: number, end: number) {
        this.pending = this.pending
          .then(async () => {
            if (
              !Number.isSafeInteger(begin) ||
              !Number.isSafeInteger(end) ||
              begin < 0 ||
              end <= begin ||
              end > length ||
              end - begin > MAX_RANGE_BYTES
            ) {
              throw new Error('PDF range request is invalid')
            }
            const bytes = new Uint8Array(end - begin)
            for (let offset = begin; offset < end; offset += CHUNK_SIZE) {
              if (controller.signal.aborted) return
              bytes.set(await read(offset, Math.min(offset + CHUNK_SIZE, end)), offset - begin)
            }
            // PDF.js completes one range reader on the first onDataRange call.
            // Native reads stay bounded, but each requested range is delivered once.
            this.onDataRange(begin, bytes)
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              this.abort()
              onFailure()
            }
          })
      }

      override abort() {
        abort()
        signal.removeEventListener('abort', abort)
      }
    }
    return new NativePdfRange(length, initial, true)
  } catch (error) {
    abort()
    signal.removeEventListener('abort', abort)
    throw error
  }
}
