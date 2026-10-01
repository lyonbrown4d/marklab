import {
  CompletionItemKind,
  InsertTextFormat,
  TextEdit,
  type CompletionItem,
  type Position,
} from 'vscode-languageserver-types'
import type { TextDocument } from 'vscode-languageserver-textdocument'

type MarkdownSnippet = {
  label: string
  detail: string
  newText: string
  keywords: readonly string[]
}

const MARKDOWN_SNIPPETS: readonly MarkdownSnippet[] = [
  { label: 'Heading', detail: 'Markdown heading', newText: '# ${1:Heading}', keywords: ['title'] },
  { label: 'Link', detail: 'Markdown link', newText: '[${1:text}](${2:path})', keywords: ['url'] },
  {
    label: 'Image',
    detail: 'Markdown image',
    newText: '![${1:alt}](${2:path})',
    keywords: ['asset'],
  },
  {
    label: 'Code fence',
    detail: 'Fenced code block',
    newText: '```${1:language}\n${0}\n```',
    keywords: ['code', 'block'],
  },
  {
    label: 'Table',
    detail: 'GFM table',
    newText: '| ${1:Column 1} | ${2:Column 2} |\n| --- | --- |\n| ${3:Value} | ${4:Value} |',
    keywords: ['grid'],
  },
  {
    label: 'Task list',
    detail: 'Unchecked task list item',
    newText: '- [ ] ${1:Task}',
    keywords: ['todo', 'check'],
  },
  {
    label: 'Blockquote',
    detail: 'Markdown blockquote',
    newText: '> ${1:Quote}',
    keywords: ['quote'],
  },
  {
    label: 'Horizontal rule',
    detail: 'Markdown horizontal rule',
    newText: '---',
    keywords: ['divider', 'separator'],
  },
  {
    label: 'Unordered list',
    detail: 'Markdown unordered list item',
    newText: '- ${1:Item}',
    keywords: ['bullet', 'list'],
  },
  {
    label: 'Ordered list',
    detail: 'Markdown ordered list item',
    newText: '1. ${1:Item}',
    keywords: ['number', 'list'],
  },
]

export const markdownSnippetCompletions = (
  document: TextDocument,
  position: Position,
): CompletionItem[] | null => {
  if (document.uri.toLowerCase().startsWith('marklab-embedded:')) return null
  const lineStart = document.offsetAt({ line: position.line, character: 0 })
  const positionOffset = document.offsetAt(position)
  const linePrefix = document.getText().slice(lineStart, positionOffset)
  const match = linePrefix.match(/^\s*\/([a-z-]*)$/i)
  if (!match) return null

  const query = (match[1] ?? '').toLowerCase()
  const slashCharacter = linePrefix.lastIndexOf('/')
  const range = {
    start: { line: position.line, character: slashCharacter },
    end: position,
  }
  return MARKDOWN_SNIPPETS.filter((snippet) => matchesSnippet(snippet, query)).map(
    (snippet, index) => ({
      label: snippet.label,
      detail: snippet.detail,
      filterText: [snippet.label, ...snippet.keywords].join(' '),
      insertTextFormat: InsertTextFormat.Snippet,
      kind: CompletionItemKind.Snippet,
      sortText: `90${String(index).padStart(2, '0')}`,
      textEdit: TextEdit.replace(range, snippet.newText),
    }),
  )
}

const matchesSnippet = (snippet: MarkdownSnippet, query: string): boolean => {
  if (!query) return true
  return [snippet.label, ...snippet.keywords].some((value) => value.toLowerCase().includes(query))
}
