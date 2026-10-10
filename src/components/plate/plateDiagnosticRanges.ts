import { toString } from 'mdast-util-to-string'
import { PathApi, TextApi, type Path, type TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { extractLinks } from '@/logic/paths'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import type { MarkdownLanguageCodeAction } from '@/services/markdownLanguageApi'
import { plateMarkdownPluginOptions } from '@/components/plate/plateMarkdownSharedConfig'

export type PlateDiagnosticRange = TRange & {
  plateDiagnosticId: string
  plateDiagnosticMessage: string
  plateDiagnosticSeverity: MarkdownSourceDiagnostic['severity']
}

type SourcePosition = { line: number; column: number }
type SourceBlock = {
  end: SourcePosition
  start: SourcePosition
  text: string
}
type NodeRecord = {
  children?: unknown[]
  text?: unknown
  url?: unknown
}
type TextEntry = { path: Path; text: string }

const processor = unified().use(remarkParse).use(plateMarkdownPluginOptions.remarkPlugins)

const sourceBlocks = (markdown: string): SourceBlock[] => {
  const tree = processor.parse(markdown) as {
    children?: Array<{ position?: { start?: SourcePosition; end?: SourcePosition } }>
  }
  return (tree.children ?? []).flatMap((node) => {
    const start = node.position?.start
    const end = node.position?.end
    return start && end ? [{ start, end, text: toString(node as never) }] : []
  })
}

const normalizeText = (value: string) => value.replace(/\s+/gu, ' ').trim()

const diagnosticBlockIndex = (
  editor: PlateEditor,
  markdown: string,
  diagnostic: MarkdownSourceDiagnostic,
) => {
  const blocks = sourceBlocks(markdown)
  const sourceIndex = blocks.findIndex(
    ({ start, end }) => diagnostic.line >= start.line && diagnostic.line <= end.line,
  )
  if (sourceIndex < 0) return null
  const sourceText = normalizeText(blocks[sourceIndex]?.text ?? '')
  if (sourceText) {
    const matches = (_: unknown, index: number) => {
      const plateText = normalizeText(editor.api.string([index]))
      return (
        plateText === sourceText || plateText.includes(sourceText) || sourceText.includes(plateText)
      )
    }
    if (editor.children[sourceIndex] && matches(editor.children[sourceIndex], sourceIndex)) {
      return sourceIndex
    }
    const matched = editor.children
      .map((node, index) => ({ index, node }))
      .filter(({ index, node }) => matches(node, index))
      .sort(
        (left, right) => Math.abs(left.index - sourceIndex) - Math.abs(right.index - sourceIndex),
      )[0]
    if (matched) return matched.index
  }
  return sourceIndex < editor.children.length ? sourceIndex : null
}

const collectTextEntries = (node: unknown, path: Path, entries: TextEntry[]) => {
  if (!node || typeof node !== 'object') return
  const record = node as NodeRecord
  if (typeof record.text === 'string') {
    entries.push({ path, text: record.text })
    return
  }
  record.children?.forEach((child, index) => collectTextEntries(child, [...path, index], entries))
}

const findUrlElementPath = (node: unknown, path: Path, target: string): Path | null => {
  if (!node || typeof node !== 'object') return null
  const record = node as NodeRecord
  if (record.url === target) return path
  for (let index = 0; index < (record.children?.length ?? 0); index += 1) {
    const found = findUrlElementPath(record.children?.[index], [...path, index], target)
    if (found) return found
  }
  return null
}

const sourceLinkAtDiagnostic = (markdown: string, diagnostic: MarkdownSourceDiagnostic) => {
  const line = markdown.split(/\r?\n/u)[diagnostic.line - 1] ?? ''
  return (
    extractLinks(markdown).find((link) => {
      if (link.line !== diagnostic.line) return false
      const start = line.indexOf(link.target, Math.max(0, link.column - 1))
      if (start < 0) return false
      const diagnosticStart = diagnostic.startColumn - 1
      return diagnosticStart >= start && diagnosticStart <= start + link.target.length
    }) ?? null
  )
}

const diagnosticProps = (diagnostic: MarkdownSourceDiagnostic) => ({
  plateDiagnosticId:
    diagnostic.id ??
    `${diagnostic.line}:${diagnostic.startColumn}:${diagnostic.endColumn}:${diagnostic.message}`,
  plateDiagnosticMessage: diagnostic.message,
  plateDiagnosticSeverity: diagnostic.severity,
})

const fullTextRanges = (entries: TextEntry[], diagnostic: MarkdownSourceDiagnostic) =>
  entries
    .filter(({ text }) => text.length > 0)
    .map(({ path, text }) => ({
      anchor: { path, offset: 0 },
      focus: { path, offset: text.length },
      ...diagnosticProps(diagnostic),
    }))

const visibleTextRanges = (
  entries: TextEntry[],
  visibleText: string,
  diagnostic: MarkdownSourceDiagnostic,
) => {
  if (!visibleText) return []
  const combined = entries.map(({ text }) => text).join('')
  const matchStart = combined.indexOf(visibleText)
  if (matchStart < 0) return []
  const matchEnd = matchStart + visibleText.length
  let offset = 0
  return entries.flatMap(({ path, text }) => {
    const start = Math.max(matchStart, offset)
    const end = Math.min(matchEnd, offset + text.length)
    const range =
      start < end
        ? [
            {
              anchor: { path, offset: start - offset },
              focus: { path, offset: end - offset },
              ...diagnosticProps(diagnostic),
            },
          ]
        : []
    offset += text.length
    return range
  })
}

export const createPlateDiagnosticRanges = (
  editor: PlateEditor,
  markdown: string,
  diagnostics: MarkdownSourceDiagnostic[],
): PlateDiagnosticRange[] =>
  diagnostics.flatMap((diagnostic) => {
    const blockIndex = diagnosticBlockIndex(editor, markdown, diagnostic)
    if (blockIndex === null) return []
    const block = editor.children[blockIndex]
    const link = sourceLinkAtDiagnostic(markdown, diagnostic)
    const linkPath = link ? findUrlElementPath(block, [blockIndex], link.target) : null
    const linkEntries: TextEntry[] = []
    if (linkPath) collectTextEntries(editor.api.node(linkPath)?.[0], linkPath, linkEntries)
    if (linkEntries.length) return fullTextRanges(linkEntries, diagnostic)

    const entries: TextEntry[] = []
    collectTextEntries(block, [blockIndex], entries)
    const line = markdown.split(/\r?\n/u)[diagnostic.line - 1] ?? ''
    const sourceText = line.slice(diagnostic.startColumn - 1, diagnostic.endColumn - 1)
    const visible = visibleTextRanges(entries, sourceText, diagnostic)
    const fallback = entries.find((entry) => entry.text.length > 0)
    return visible.length ? visible : fullTextRanges(fallback ? [fallback] : [], diagnostic)
  })

export const focusPlateDiagnostic = (
  editor: PlateEditor,
  markdown: string,
  diagnostic: MarkdownSourceDiagnostic,
) => {
  const range = createPlateDiagnosticRanges(editor, markdown, [diagnostic])[0]
  if (!range) return false
  editor.tf.select({ anchor: range.anchor, focus: range.focus })
  editor.tf.focus()
  try {
    editor.api.scrollIntoView(range.anchor)
  } catch {
    // Chunked content may not be mounted yet; retaining the selection preserves navigation intent.
  }
  return true
}

const editedLinkTarget = (
  markdown: string,
  action: Extract<MarkdownLanguageCodeAction, { kind: 'replace-text' }>,
) => {
  const line = markdown.split(/\r?\n/u)[action.edit.line - 1] ?? ''
  const link = extractLinks(markdown).find((candidate) => {
    if (candidate.line !== action.edit.line) return false
    const start = line.indexOf(candidate.target, Math.max(0, candidate.column - 1))
    return (
      start >= 0 &&
      action.edit.startColumn - 1 >= start &&
      action.edit.startColumn - 1 <= start + candidate.target.length
    )
  })
  if (!link) return null
  const targetStart = line.indexOf(link.target, Math.max(0, link.column - 1))
  const editStart = action.edit.startColumn - 1 - targetStart
  const editEnd = action.edit.endColumn - 1 - targetStart
  if (editStart < 0 || editEnd < editStart || editEnd > link.target.length) return null
  return {
    current: link.target,
    next: `${link.target.slice(0, editStart)}${action.edit.newText}${link.target.slice(editEnd)}`,
  }
}

export const applyPlateDiagnosticAction = (
  editor: PlateEditor,
  markdown: string,
  problem: MarkdownSourceDiagnostic,
  action: MarkdownLanguageCodeAction,
) => {
  if (action.kind !== 'replace-text') return false
  const target = editedLinkTarget(markdown, action)
  const blockIndex = diagnosticBlockIndex(editor, markdown, problem)
  if (!target || blockIndex === null) return false
  const path = findUrlElementPath(editor.children[blockIndex], [blockIndex], target.current)
  if (!path) return false
  editor.tf.setNodes({ url: target.next } as never, { at: path })
  return true
}

export const diagnosticRangesForEntry = (
  ranges: PlateDiagnosticRange[],
  entry: [unknown, Path],
) => {
  const [node, path] = entry
  if (!TextApi.isText(node)) return []
  return ranges.filter((range) => PathApi.equals(range.anchor.path, path))
}
