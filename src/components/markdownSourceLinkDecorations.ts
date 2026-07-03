import type { editor as MonacoEditor } from 'monaco-editor'
import i18n from '@/i18n/setup'

type MonacoModule = typeof import('monaco-editor')
type Disposable = { dispose: () => void }

const LINK_DECORATION_MAX_CHARS = 500_000

export const registerMarkdownLinkDecorations = (
  monaco: MonacoModule,
  editor: MonacoEditor.IStandaloneCodeEditor,
): Disposable => {
  const collection = editor.createDecorationsCollection()

  const refresh = () => {
    const model = editor.getModel()
    if (!model) {
      collection.clear()
      return
    }

    const content = model.getValue()
    if (content.length > LINK_DECORATION_MAX_CHARS) {
      collection.clear()
      return
    }

    collection.set(
      linkTargetRanges(content).map((range) => ({
        range: new monaco.Range(range.line, range.startColumn, range.line, range.endColumn),
        options: {
          inlineClassName: 'marklab-source-link-target',
          hoverMessage: { value: i18n.t('editor.sourceLinkHint') },
        },
      })),
    )
  }

  const contentDisposable = editor.onDidChangeModelContent(refresh)
  refresh()

  return {
    dispose: () => {
      contentDisposable.dispose()
      collection.clear()
    },
  }
}

const linkTargetRanges = (content: string) => {
  return content.split(/\r?\n/).flatMap((lineText, index) => {
    const line = index + 1
    return [...markdownLinkRanges(lineText, line), ...wikiLinkRanges(lineText, line)]
  })
}

const markdownLinkRanges = (lineText: string, line: number) => {
  const ranges: Array<{ line: number; startColumn: number; endColumn: number }> = []
  for (const match of lineText.matchAll(/\[[^\]\n]*]\(([^)\n]+)\)/g)) {
    const target = match[1] ?? ''
    const matchText = match[0] ?? ''
    const targetStart = (match.index ?? 0) + matchText.lastIndexOf('(') + 1
    ranges.push({
      line,
      startColumn: targetStart + 1,
      endColumn: targetStart + target.length + 1,
    })
  }
  return ranges
}

const wikiLinkRanges = (lineText: string, line: number) => {
  const ranges: Array<{ line: number; startColumn: number; endColumn: number }> = []
  for (const match of lineText.matchAll(/!?\[\[([^\]\n]+?)]]/g)) {
    const rawTarget = match[1] ?? ''
    const matchText = match[0] ?? ''
    const targetStart = (match.index ?? 0) + (matchText.startsWith('!') ? 3 : 2)
    ranges.push({
      line,
      startColumn: targetStart + 1,
      endColumn: targetStart + rawTarget.length + 1,
    })
  }
  return ranges
}
