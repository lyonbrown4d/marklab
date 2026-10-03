import type { ShortcutActionId } from '@/logic/shortcuts'

export type MarkdownEditorCommandKind = 'block' | 'inline' | 'insert' | 'asset' | 'format'
export type SlashCommandGroupId = 'text' | 'list' | 'advanced'

export type SlashCommandLabelKey =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'quote'
  | 'divider'
  | 'link'
  | 'bold'
  | 'italic'
  | 'inlineCode'
  | 'strike'
  | 'clearFormat'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'image'
  | 'imageUrl'
  | 'codeBlock'
  | 'codeTypeScript'
  | 'codeJavaScript'
  | 'codeJson'
  | 'codeBash'
  | 'codeHtml'
  | 'mermaid'
  | 'table'
  | 'footnote'
  | 'frontmatter'
  | 'details'
  | 'toc'
  | 'calloutNote'
  | 'calloutTip'
  | 'calloutImportant'
  | 'calloutWarning'
  | 'calloutCaution'
  | 'calendarFile'

export type MarkdownEditorCommandId =
  | ShortcutActionId
  | 'editor.divider'
  | 'editor.taskList'
  | 'editor.imageUrl'
  | 'editor.codeTypeScript'
  | 'editor.codeJavaScript'
  | 'editor.codeJson'
  | 'editor.codeBash'
  | 'editor.codeHtml'
  | 'editor.mermaid'
  | 'editor.calloutNote'
  | 'editor.calloutTip'
  | 'editor.calloutImportant'
  | 'editor.calloutWarning'
  | 'editor.calloutCaution'
  | 'editor.footnote'
  | 'editor.frontmatter'
  | 'editor.details'
  | 'editor.toc'
  | 'editor.calendarFile'

export type MarkdownEditorSlashCommand = {
  aliases?: readonly string[]
  group: SlashCommandGroupId
  key: string
  labelKey: SlashCommandLabelKey
  mode: 'native' | 'custom'
}

export type MarkdownEditorCommandSpec = {
  id: MarkdownEditorCommandId
  actionId?: ShortcutActionId
  kind: MarkdownEditorCommandKind
  slash?: MarkdownEditorSlashCommand
  headingLevel?: number
}

export type MarkdownEditorSlashCommandEntry = MarkdownEditorSlashCommand & {
  commandId: MarkdownEditorCommandId
  actionId?: ShortcutActionId
}
