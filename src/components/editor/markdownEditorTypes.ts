export const markdownEditorVariants = ['page', 'embedded'] as const

export type MarkdownEditorVariant = (typeof markdownEditorVariants)[number]

export type MarkdownEditorSlashLabels = {
  advancedGroup: string
  bold: string
  bulletList: string
  calendarFile: string
  calendarFilePrompt: string
  cancel: string
  calloutCaution: string
  calloutImportant: string
  calloutNote: string
  calloutTip: string
  calloutWarning: string
  clearFormat: string
  codeBash: string
  codeBlock: string
  codeHtml: string
  codeJavaScript: string
  codeJson: string
  codeTypeScript: string
  details: string
  divider: string
  footnote: string
  frontmatter: string
  heading1: string
  heading2: string
  heading3: string
  heading4: string
  heading5: string
  heading6: string
  image: string
  imageAltPrompt: string
  imageUrl: string
  imageUrlPrompt: string
  insertionError: string
  inlineCode: string
  italic: string
  link: string
  linkTextPrompt: string
  linkUrlPrompt: string
  listGroup: string
  menuLabel: string
  mermaid: string
  noResults: string
  orderedList: string
  quote: string
  strike: string
  table: string
  taskList: string
  text: string
  textGroup: string
  toc: string
}

export type MarkdownEditorProps = {
  activePath: string | null
  autoFocus?: boolean
  value: string
  onChange: (value: string) => void
  placeholder: string
  slashLabels: MarkdownEditorSlashLabels
  onCalendarFileCreate?: () => Promise<string | null>
  onStatusChange?: (status: MarkdownEditorStatus) => void
  onWorkspaceLink?: (target: string, documentPath: string | null) => void
  readOnly?: boolean
  variant?: MarkdownEditorVariant
}

export type MarkdownEditorHandle = {
  focus: () => void
  getMarkdown: () => Promise<string>
}

export type MarkdownEditorStatus =
  { phase: 'loading' } | { phase: 'ready' } | { phase: 'error'; message: string }
