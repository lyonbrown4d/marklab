import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'

export type MarkdownEditorProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
  placeholder: string
  slashLabels: SlashCommandLabels
}

export type MarkdownEditorHandle = {
  focus: () => void
  getMarkdown: () => string
}
