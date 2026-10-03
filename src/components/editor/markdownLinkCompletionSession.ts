import { CompletionItemKind, type CompletionItem } from 'vscode-languageserver-types'

import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'

export type MarkdownLinkSuggestion = {
  label: string
  detail?: string
  url: string
}

export type MarkdownLinkCompletionClient = Pick<
  LanguageIntelligenceApi,
  'openDocument' | 'changeDocument' | 'closeDocument' | 'completion'
>

type MarkdownLinkCompletionSessionOptions = {
  client: MarkdownLinkCompletionClient
  path: string | null
  uri: string
}

const LINK_TARGET_OFFSET = 3
const EMPTY_LINK_DOCUMENT = '[]()'
const SESSION_URI_SEED = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
let nextSessionUriId = 0

export const createMarkdownLinkSessionUri = (): string => {
  nextSessionUriId += 1
  return `marklab-link-suggestion:${SESSION_URI_SEED}-${nextSessionUriId}`
}

const completionText = (item: CompletionItem): string => {
  if (item.textEdit) return item.textEdit.newText
  return item.insertText ?? item.label
}

const toSuggestion = (item: CompletionItem): MarkdownLinkSuggestion | null => {
  if (item.kind !== CompletionItemKind.File) return null
  const url = completionText(item).trim()
  if (!url) return null
  return {
    label: item.label,
    ...(item.detail ? { detail: item.detail } : {}),
    url,
  }
}

export const createMarkdownLinkCompletionSession = ({
  client,
  path,
  uri,
}: MarkdownLinkCompletionSessionOptions) => {
  let closed = false
  let query = ''
  let version = 1
  let remoteQuery = ''
  let remoteState: 'absent' | 'synchronized' | 'uncertain' = 'absent'
  let synchronization = Promise.resolve()

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(new Error('Markdown link completion session is closed'))
    const result = synchronization.then(operation)
    synchronization = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const openDocument = async (nextQuery: string, nextVersion: number): Promise<void> => {
    remoteState = 'uncertain'
    await client.openDocument({
      uri,
      languageId: 'markdown',
      path,
      version: nextVersion,
      text: nextQuery ? `[](${nextQuery})` : EMPTY_LINK_DOCUMENT,
    })
    remoteQuery = nextQuery
    remoteState = 'synchronized'
  }

  const recoverDocument = async (nextQuery: string, nextVersion: number): Promise<void> => {
    try {
      await client.closeDocument({ uri })
    } catch {
      // The main process may not have created the document before the failed request.
    }
    remoteState = 'absent'
    await openDocument(nextQuery, nextVersion)
  }

  const complete = (nextQuery: string): Promise<MarkdownLinkSuggestion[]> =>
    enqueue(async () => {
      if (nextQuery !== query) {
        query = nextQuery
        version += 1
      }
      const requestQuery = query
      const requestVersion = version

      if (remoteState === 'uncertain') {
        await recoverDocument(requestQuery, requestVersion)
      } else if (remoteState === 'absent') {
        await openDocument('', 1)
      }

      if (remoteQuery !== requestQuery) {
        const previousLength = remoteQuery.length
        remoteState = 'uncertain'
        await client.changeDocument({
          uri,
          version: requestVersion,
          changes: [
            {
              range: {
                start: { line: 0, character: LINK_TARGET_OFFSET },
                end: { line: 0, character: LINK_TARGET_OFFSET + previousLength },
              },
              rangeLength: previousLength,
              text: requestQuery,
            },
          ],
        })
        remoteQuery = requestQuery
        remoteState = 'synchronized'
      }
      const result = await client.completion({
        uri,
        version: requestVersion,
        position: { line: 0, character: LINK_TARGET_OFFSET + requestQuery.length },
      })
      return result.items.flatMap((item) => {
        const suggestion = toSuggestion(item)
        return suggestion ? [suggestion] : []
      })
    })

  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await synchronization
    if (remoteState === 'absent') return
    try {
      await client.closeDocument({ uri })
    } finally {
      remoteState = 'absent'
    }
  }

  return { complete, close }
}
