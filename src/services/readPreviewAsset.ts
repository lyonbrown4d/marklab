import type { WorkspaceTextPreview } from '@/types/workspaceTextPreview'

export const readPreviewTextAsset = async (
  src: string,
  limit?: number,
): Promise<WorkspaceTextPreview> => {
  const response = await fetch(
    src,
    limit ? { headers: { Range: `bytes=0-${limit - 1}` } } : undefined,
  )
  if (!response.ok) throw new Error('Unable to read the selected file version')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (limit && bytes.length > limit) throw new Error('File preview exceeds its byte limit')
  const total = Number(response.headers.get('content-range')?.split('/').pop())
  const truncated = Number.isFinite(total) && total > bytes.length
  return {
    content: new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: truncated }),
    truncated,
  }
}
