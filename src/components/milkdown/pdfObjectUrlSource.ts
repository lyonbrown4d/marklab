import { fetchPreviewAssetBlob } from '@/components/previews/localAssetSource'

export const fetchPdfObjectUrl = async (fileUrl: string, signal?: AbortSignal): Promise<string> => {
  const blob = await fetchPreviewAssetBlob(fileUrl, 'application/pdf', signal)
  const pdfBlob =
    blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
  return URL.createObjectURL(pdfBlob)
}
