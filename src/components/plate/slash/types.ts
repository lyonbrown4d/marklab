import type { LucideIcon } from 'lucide-react'
import type { TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type {
  MarkdownEditorCommandId,
  MarkdownEditorCommandKind,
  SlashCommandGroupId,
  SlashCommandLabelKey,
} from '@/components/editor/editorCommandCatalog'
import type { ShortcutActionId } from '@/logic/shortcuts'

export type PlateSlashCommandLabels = Record<SlashCommandLabelKey, string> & {
  advancedGroup: string
  calendarFilePrompt: string
  cancel: string
  imageAltPrompt: string
  imageUrlPrompt: string
  insertionError: string
  linkTextPrompt: string
  linkUrlPrompt: string
  listGroup: string
  menuLabel: string
  noResults: string
  textGroup: string
}

export type PlateSlashCommand = {
  actionId?: ShortcutActionId
  aliases: readonly string[]
  commandId: MarkdownEditorCommandId
  group: SlashCommandGroupId
  icon: LucideIcon
  key: string
  kind: MarkdownEditorCommandKind
  label: string
}

export type PlateSlashTrigger = {
  query: string
  range: TRange
  slashText: string
}

export type PlateSlashUrlValues = { text: string; url: string }

export type PlateSlashUrlInsertionRequest = {
  initialText: string
  insert: (values: PlateSlashUrlValues) => void
  invalidate: () => void
  kind: 'image-url' | 'link'
  restoreFocus: () => void
}

export type RunPlateSlashCommandOptions = {
  command: PlateSlashCommand
  editor: PlateEditor
  onCalendarFileCreate?: () => Promise<string | null>
  onError?: (error: unknown) => void
  onImageImport?: () => Promise<boolean>
  onUrlInsert?: (request: PlateSlashUrlInsertionRequest) => void
  trigger: PlateSlashTrigger
}
