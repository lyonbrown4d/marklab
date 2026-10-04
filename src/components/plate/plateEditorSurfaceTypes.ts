import type { PlateEditor } from 'platejs/react'
import type { PlateSlashCommandLabels } from '@/components/plate/slash'
import type { MarkdownEditorStatus } from '@/components/editor/markdownEditorTypes'
import type { ShortcutBindings } from '@/logic/shortcuts'
import type { MarkdownAssetImportStrategy } from '@/store/appTypes'

export type PlateEditorSurfaceHandle = {
  focus: () => void
  getEditor: () => PlateEditor
  getMarkdown: () => Promise<string>
  openLinkDialog: () => boolean
}

export type PlateEditorSurfaceProps = {
  activePath: string | null
  assetImportStrategy?: MarkdownAssetImportStrategy
  autoFocus?: boolean
  className?: string
  onChange: (value: string) => void
  onCalendarFileCreate?: () => Promise<string | null>
  onImageImport?: () => Promise<boolean>
  onStatusChange?: (status: MarkdownEditorStatus) => void
  onWorkspaceLink?: (target: string, documentPath: string | null) => void
  placeholder: string
  readOnly?: boolean
  slashLabels?: PlateSlashCommandLabels
  smoothScrolling?: boolean
  shortcutOverrides?: ShortcutBindings
  typewriterScroll?: boolean
  value: string
}
