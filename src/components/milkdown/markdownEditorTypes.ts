import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'
import type { ShortcutBindings } from '@/logic/shortcuts'

export type MarkdownEditorProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
  placeholder: string
  slashLabels: SlashCommandLabels
  onCalendarFileCreate?: () => Promise<string | null>
  readOnly?: boolean
}

export type MarkdownEditorHandle = {
  focus: () => void
  getMarkdown: () => string
}

export type MarkdownEditorStatus =
  { phase: 'loading' } | { phase: 'ready' } | { phase: 'error'; message: string }

export type MarkdownPlaygroundControllerOptions = MarkdownEditorProps & {
  darkMode: boolean
  shortcutOverrides?: ShortcutBindings
}

export type QueuedMarkdownUpdate = {
  documentIdentity: MarkdownEditorProps['activePath']
  markdown: string
  onChange: MarkdownEditorProps['onChange']
}

export type ThrottledMarkdownUpdate = ((update: QueuedMarkdownUpdate) => void) & {
  cancel: () => void
  flush: () => void
}
