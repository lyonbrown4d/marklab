import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'

export type MarkdownEditorProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
  placeholder: string
  slashLabels: SlashCommandLabels
  onCalendarFileCreate?: () => Promise<string | null>
}

export type MarkdownEditorHandle = {
  focus: () => void
  getMarkdown: () => string
}

export type MarkdownEditorStatus =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }
