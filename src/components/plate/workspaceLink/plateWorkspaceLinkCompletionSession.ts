import { CompletionItemKind, type CompletionItem } from 'vscode-languageserver-types'
import type { MarkdownLinkCompletionClient } from '@/components/editor/markdownLinkCompletionSession'
import type { PlateWorkspaceLinkItem } from '@/components/plate/workspaceLink/plateWorkspaceLinkCompletion'
import type { MarkdownLanguageCodeAction } from '@/services/markdownLanguageApi'

type CodeActionClient = {
  getCodeActions: (request: {
    path: string
    content: string
    line: number
    column: number
  }) => Promise<MarkdownLanguageCodeAction[]>
}

type SessionOptions = {
  codeActions: CodeActionClient
  completion: MarkdownLinkCompletionClient
  path: string
  uri: string
}

let sessionSequence = 0

export const createPlateWorkspaceLinkSessionUri = () =>
  `marklab-rich-workspace-link:${Date.now().toString(36)}-${++sessionSequence}`

const completionText = (item: CompletionItem) =>
  item.textEdit?.newText ?? item.insertText ?? item.label

const completionStartCharacter = (item: CompletionItem, fallback: number) => {
  const edit = item.textEdit
  if (!edit) return fallback
  return 'range' in edit ? edit.range.start.character : edit.replace.start.character
}

const completionItem = (
  item: CompletionItem,
  query: string,
  cursorCharacter: number,
): PlateWorkspaceLinkItem | null => {
  const kind =
    item.kind === CompletionItemKind.File
      ? 'file'
      : item.kind === CompletionItemKind.Reference
        ? 'heading'
        : null
  if (!kind) return null
  const insertText = completionText(item).trim()
  if (!insertText) return null
  return {
    detail: item.detail,
    insertText,
    kind,
    label: item.label,
    replacementLength: Math.min(
      query.length,
      Math.max(0, cursorCharacter - completionStartCharacter(item, cursorCharacter)),
    ),
  }
}

const actionItem = (
  action: MarkdownLanguageCodeAction,
  query: string,
): PlateWorkspaceLinkItem | null => {
  if (action.kind === 'create-file') {
    return {
      action,
      detail: action.path,
      insertText: '',
      kind: 'create-file',
      label: action.title,
      replacementLength: 0,
    }
  }
  const hashIndex = query.indexOf('#')
  if (hashIndex < 0) return null
  return {
    action,
    insertText: action.edit.newText,
    kind: 'replace-anchor',
    label: action.title,
    replacementLength: query.length - hashIndex,
  }
}

export const createPlateWorkspaceLinkCompletionSession = ({
  codeActions,
  completion,
  path,
  uri,
}: SessionOptions) => {
  let closed = false
  let opened = false
  let version = 0
  let remoteText = ''
  let queue = Promise.resolve()

  const synchronize = async (text: string) => {
    version += 1
    if (!opened) {
      await completion.openDocument({ uri, languageId: 'markdown', path, version, text })
      opened = true
      remoteText = text
      return
    }
    await completion.changeDocument({
      uri,
      version,
      changes: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: textPositionAtEnd(remoteText),
          },
          rangeLength: remoteText.length,
          text,
        },
      ],
    })
    remoteText = text
  }

  const complete = (content: string, query: string): Promise<PlateWorkspaceLinkItem[]> => {
    const result = queue.then(async () => {
      if (closed) return []
      const prefix = content.endsWith('\n') ? content : `${content}\n`
      const text = `${prefix}\n[[${query}`
      await synchronize(text)
      const line = text.split('\n').length - 1
      const character = query.length + 2
      const [completionResult, actions] = await Promise.all([
        completion.completion({ uri, version, position: { line, character } }),
        codeActions.getCodeActions({
          path,
          content: `[[${query}]]`,
          line: 1,
          column: Math.max(3, query.length + 2),
        }),
      ])
      const suggestions = completionResult.items.flatMap((item) => {
        const candidate = completionItem(item, query, character)
        return candidate ? [candidate] : []
      })
      const explicitActions = actions.flatMap((action) => {
        const item = actionItem(action, query)
        return item ? [item] : []
      })
      const candidates = [...suggestions.slice(0, 5), ...explicitActions.slice(0, 3)]
      const seen = new Set<string>()
      return candidates.filter((item) => {
        const key = `${item.kind}\0${item.insertText}\0${item.replacementLength}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    })
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const close = async () => {
    if (closed) return
    closed = true
    await queue
    if (opened) await completion.closeDocument({ uri })
  }

  return { close, complete }
}

const textPositionAtEnd = (text: string) => {
  const lines = text.split('\n')
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 }
}
