import { fetchPreviewAssetBlob } from '@/components/previews/localAssetSource'

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')

export const fetchPdfDocumentData = async (
  fileUrl: string,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> => {
  const sourceUrl = fileUrl.split('#')[0] ?? fileUrl
  const blob = await fetchPreviewAssetBlob(sourceUrl, 'application/pdf', signal)
  if (signal?.aborted) throw abortError()

  const bytes = await blob.arrayBuffer()
  if (signal?.aborted) throw abortError()
  return new Uint8Array(bytes)
}
