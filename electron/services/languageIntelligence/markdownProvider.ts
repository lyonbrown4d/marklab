import type { TextDocument } from 'vscode-languageserver-textdocument'
import type {
  CompletionItem,
  CompletionList,
  Diagnostic,
  Position,
  Range,
  TextEdit,
} from 'vscode-languageserver-types'

import { EmbeddedMarkdownLanguageService } from '@electron/services/markdownLanguage/service.js'
import { MermaidLanguageProvider } from '@electron/services/mermaidLanguage/provider.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import { markdownSnippetCompletions } from '@electron/services/languageIntelligence/markdownSnippets.js'

type MarkdownProviderContext = {
  document: TextDocument
  path: string | null
  position: Position
  workspace: WorkspaceService
}

type MermaidBlock = {
  contentStartLine: number
  endLine: number
  ordinal: number
  text: string
}

const mermaidAliases = new Set(['mermaid', 'mmd'])

export class MarkdownLanguageIntelligenceProvider {
  readonly languageIds = ['markdown']

  constructor(
    private readonly markdown = new EmbeddedMarkdownLanguageService(),
    private readonly mermaid = new MermaidLanguageProvider(),
  ) {}

  async completion(context: MarkdownProviderContext): Promise<CompletionList> {
    const { document, path, position, workspace } = context
    const block = mermaidBlocks(document.getText()).find(
      (candidate) =>
        position.line >= candidate.contentStartLine && position.line < candidate.endLine,
    )
    if (block) {
      const result = this.mermaid.provideCompletions(
        embeddedDocument(document, block),
        embeddedPosition(position, block),
      )
      return {
        ...result,
        items: result.items.map((item) => mapCompletionItem(item, block.contentStartLine)),
      }
    }
    const snippets = markdownSnippetCompletions(document, position)
    if (snippets) return { isIncomplete: false, items: snippets }
    const items = await this.markdown.getCompletions(workspace, {
      path,
      content: document.getText(),
      line: position.line + 1,
      column: position.character + 1,
    })
    return {
      isIncomplete: false,
      items: items.map((item): CompletionItem => {
        const startCharacter = Math.max(0, item.replacementStartColumn - 1)
        return {
          label: item.label,
          kind: item.lspKind,
          detail: item.detail,
          insertText: item.insertText,
          sortText: item.sortText,
          textEdit: {
            newText: item.insertText,
            range: {
              start: { line: position.line, character: startCharacter },
              end: position,
            },
          },
        }
      }),
    }
  }

  async diagnostics({
    document,
  }: Pick<MarkdownProviderContext, 'document' | 'path'>): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = []
    for (const block of mermaidBlocks(document.getText())) {
      const embeddedDiagnostics = await this.mermaid.provideDiagnostics(
        embeddedDocument(document, block),
      )
      diagnostics.push(
        ...embeddedDiagnostics.map((diagnostic) => ({
          ...diagnostic,
          range: mapRange(diagnostic.range, block.contentStartLine),
        })),
      )
    }
    return diagnostics
  }
}

const mermaidBlocks = (text: string): MermaidBlock[] => {
  const lines = text.split('\n')
  const blocks: MermaidBlock[] = []
  let active: {
    character: string
    length: number
    contentStartLine: number
    mermaid: boolean
  } | null = null
  let ordinal = 0

  for (let line = 0; line < lines.length; line += 1) {
    const value = trimCarriageReturn(lines[line] ?? '')
    if (active) {
      if (!isClosingFence(value, active.character, active.length)) continue
      if (active.mermaid) {
        blocks.push({
          contentStartLine: active.contentStartLine,
          endLine: line,
          ordinal: ++ordinal,
          text: lines.slice(active.contentStartLine, line).map(trimCarriageReturn).join('\n'),
        })
      }
      active = null
      continue
    }

    const opening = openingFence(value)
    if (opening) {
      active = {
        ...opening,
        contentStartLine: line + 1,
        mermaid: mermaidAliases.has(opening.languageId),
      }
    }
  }

  if (active?.mermaid) {
    blocks.push({
      contentStartLine: active.contentStartLine,
      endLine: lines.length,
      ordinal: ordinal + 1,
      text: lines.slice(active.contentStartLine).map(trimCarriageReturn).join('\n'),
    })
  }
  return blocks
}

const openingFence = (
  line: string,
): { character: string; length: number; languageId: string } | null => {
  const value = line.trimStart()
  const character = value[0]
  if (character !== '`' && character !== '~') return null
  let length = 0
  while (value[length] === character) length += 1
  if (length < 3) return null
  const info = value.slice(length).trimStart()
  let end = 0
  while (end < info.length && !isWhitespace(info.charCodeAt(end))) end += 1
  return { character, length, languageId: info.slice(0, end).toLowerCase() }
}

const isClosingFence = (line: string, character: string, minimumLength: number): boolean => {
  const value = line.trimStart()
  let length = 0
  while (value[length] === character) length += 1
  return length >= minimumLength && value.slice(length).trim().length === 0
}

const isWhitespace = (character: number): boolean =>
  character === 9 || character === 10 || character === 13 || character === 32

const trimCarriageReturn = (value: string): string =>
  value.endsWith('\r') ? value.slice(0, -1) : value

const embeddedDocument = (document: TextDocument, block: MermaidBlock) => ({
  uri: `${document.uri}#marklab-mermaid-${block.ordinal}`,
  languageId: 'mermaid',
  version: document.version,
  text: block.text,
})

const embeddedPosition = (position: Position, block: MermaidBlock): Position => ({
  line: position.line - block.contentStartLine,
  character: position.character,
})

const mapCompletionItem = (item: CompletionItem, lineOffset: number): CompletionItem => ({
  ...item,
  ...(item.textEdit ? { textEdit: mapCompletionTextEdit(item.textEdit, lineOffset) } : {}),
  ...(item.additionalTextEdits
    ? { additionalTextEdits: item.additionalTextEdits.map((edit) => mapTextEdit(edit, lineOffset)) }
    : {}),
})

const mapCompletionTextEdit = (
  edit: NonNullable<CompletionItem['textEdit']>,
  lineOffset: number,
): NonNullable<CompletionItem['textEdit']> =>
  'range' in edit
    ? mapTextEdit(edit, lineOffset)
    : {
        ...edit,
        insert: mapRange(edit.insert, lineOffset),
        replace: mapRange(edit.replace, lineOffset),
      }

const mapTextEdit = (edit: TextEdit, lineOffset: number): TextEdit => ({
  ...edit,
  range: mapRange(edit.range, lineOffset),
})

const mapRange = (range: Range, lineOffset: number): Range => ({
  start: { line: range.start.line + lineOffset, character: range.start.character },
  end: { line: range.end.line + lineOffset, character: range.end.character },
})
