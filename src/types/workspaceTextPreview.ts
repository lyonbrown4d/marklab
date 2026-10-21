import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'

export const MAX_WORKSPACE_TEXT_PREVIEW_BYTES = 1024 * 1024
export type WorkspaceTextPreview = DesktopCommandResults['workspace_read_text_preview']
export type WorkspaceTextPreviewRequest =
  DesktopCommandArgs['workspace_read_text_preview']['request']
