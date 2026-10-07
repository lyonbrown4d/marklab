import PQueue from 'p-queue'

const MARKLAB_ASSET_PROTOCOL = 'marklab-asset:'
const MARKLAB_ASSET_URL_PATTERN = /^marklab-asset:\/\/local\/v1\/[A-Za-z0-9._~-]+$/
const FETCHABLE_PREVIEW_PROTOCOLS = new Set(['http:', 'https:', 'blob:'])
const BLOCKED_EXTERNAL_PDF_PROTOCOLS = new Set(['http:', 'https:', 'data:'])
const MAX_MATERIALIZED_PREVIEW_BYTES = 64 * 1024 * 1024
const MAX_PENDING_PREVIEW_READS = 32
const previewReadQueue = new PQueue({ concurrency: 2 })

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')
const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError()
}
const sourceProtocol = (src: string) => {
  try {
    return new URL(src).protocol.toLowerCase()
  } catch {
    return null
  }
}
const strictAssetUrlWithoutHash = (src: string) => {
  const hashIndex = src.indexOf('#')
  const assetUrl = hashIndex >= 0 ? src.slice(0, hashIndex) : src
  return MARKLAB_ASSET_URL_PATTERN.test(assetUrl) ? assetUrl : null
}

export const fetchPreviewAssetBlob = async (
  src: string,
  fallbackMediaType: string,
  signal?: AbortSignal,
): Promise<Blob> => {
  assertNotAborted(signal)
  const assetUrl = strictAssetUrlWithoutHash(src)
  if (assetUrl) {
    return schedulePreviewRead(assetUrl, fallbackMediaType, signal)
  }

  const protocol = sourceProtocol(src)
  if (
    fallbackMediaType === 'application/pdf' &&
    protocol &&
    BLOCKED_EXTERNAL_PDF_PROTOCOLS.has(protocol)
  ) {
    throw new Error('External HTTP(S) and data PDF previews are unsupported')
  }
  if (
    protocol === MARKLAB_ASSET_PROTOCOL ||
    !protocol ||
    !FETCHABLE_PREVIEW_PROTOCOLS.has(protocol)
  ) {
    throw new Error('Unsupported preview asset URL')
  }

  return schedulePreviewRead(src, fallbackMediaType, signal)
}

const schedulePreviewRead = (
  src: string,
  fallbackMediaType: string,
  signal?: AbortSignal,
): Promise<Blob> => {
  if (previewReadQueue.size >= MAX_PENDING_PREVIEW_READS) {
    return Promise.reject(new Error('Preview asset read queue is full'))
  }
  return previewReadQueue.add(
    async () => {
      const response = await fetch(src, { signal })
      if (!response.ok) throw new Error(`Failed to fetch asset: ${response.status}`)
      return materializeBoundedBlob(response, fallbackMediaType, signal)
    },
    signal ? { signal } : undefined,
  ) as Promise<Blob>
}

const materializeBoundedBlob = async (
  response: Response,
  fallbackMediaType: string,
  signal?: AbortSignal,
): Promise<Blob> => {
  const declaredBytes = parseContentLength(response.headers.get('content-length'))
  if (declaredBytes !== null && declaredBytes > MAX_MATERIALIZED_PREVIEW_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('Preview asset is too large')
  }
  if (!response.body)
    return new Blob([], { type: response.headers.get('content-type') ?? fallbackMediaType })

  const reader = response.body.getReader()
  const chunks: ArrayBuffer[] = []
  let receivedBytes = 0
  try {
    for (;;) {
      assertNotAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      if (receivedBytes > MAX_MATERIALIZED_PREVIEW_BYTES) {
        throw new Error('Preview asset is too large')
      }
      const copy = new Uint8Array(value.byteLength)
      copy.set(value)
      chunks.push(copy.buffer)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return new Blob(chunks, {
    type: response.headers.get('content-type') ?? fallbackMediaType,
  })
}

const parseContentLength = (value: string | null): number | null => {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}
