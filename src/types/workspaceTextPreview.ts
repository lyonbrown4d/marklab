export const MAX_WORKSPACE_TEXT_PREVIEW_BYTES = 1024 * 1024

export type WorkspaceTextPreview = {
  content: string
  truncated: boolean
}

export type WorkspaceTextPreviewRequest = {
  limit_bytes: number
  path: string
}
