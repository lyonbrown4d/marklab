import {
  insertCompletionText,
  pickedCompletion,
  snippetCompletion,
  type Completion,
  type CompletionResult,
} from '@codemirror/autocomplete'
import type { EditorState, Text } from '@codemirror/state'
import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type Position,
  type Range,
} from 'vscode-languageserver-types'

type CompletionOffsets = {
  from: number
  to: number
}

const completionType = (kind?: CompletionItemKind): string => {
  switch (kind) {
    case CompletionItemKind.Method:
      return 'method'
    case CompletionItemKind.Function:
    case CompletionItemKind.Constructor:
      return 'function'
    case CompletionItemKind.Field:
    case CompletionItemKind.Property:
      return 'property'
    case CompletionItemKind.Variable:
      return 'variable'
    case CompletionItemKind.Class:
      return 'class'
    case CompletionItemKind.Interface:
      return 'interface'
    case CompletionItemKind.Module:
    case CompletionItemKind.Folder:
    case CompletionItemKind.File:
      return 'namespace'
    case CompletionItemKind.Unit:
    case CompletionItemKind.Value:
    case CompletionItemKind.Constant:
      return 'constant'
    case CompletionItemKind.Enum:
    case CompletionItemKind.EnumMember:
      return 'enum'
    case CompletionItemKind.Keyword:
      return 'keyword'
    case CompletionItemKind.Struct:
    case CompletionItemKind.TypeParameter:
      return 'type'
    default:
      return 'text'
  }
}

const completionDocumentation = (item: CompletionItem) => {
  if (typeof item.documentation === 'string') return item.documentation
  return item.documentation?.value
}

const completionText = (item: CompletionItem) => {
  if (item.textEdit) return item.textEdit.newText
  return item.insertText ?? item.label
}

const completionRange = (item: CompletionItem): Range | undefined => {
  if (!item.textEdit) return undefined
  return 'range' in item.textEdit ? item.textEdit.range : item.textEdit.insert
}

const positionToOffset = (doc: Text, position: Position) => {
  const lineNumber = Math.min(Math.max(position.line + 1, 1), doc.lines)
  const line = doc.line(lineNumber)
  return Math.min(line.from + Math.max(position.character, 0), line.to)
}

const completionOffsets = (state: EditorState, item: CompletionItem): CompletionOffsets | null => {
  const range = completionRange(item)
  if (!range) return null
  const start = positionToOffset(state.doc, range.start)
  const end = positionToOffset(state.doc, range.end)
  return { from: Math.min(start, end), to: Math.max(start, end) }
}

const mapCompletion = (item: CompletionItem, offsets: CompletionOffsets | null): Completion => {
  const base: Completion = {
    label: item.filterText ?? item.label,
    displayLabel: item.filterText == null ? undefined : item.label,
    detail: item.detail,
    info: completionDocumentation(item),
    type: completionType(item.kind),
    apply: completionText(item),
    sortText: item.sortText,
    commitCharacters: item.commitCharacters,
  }
  const completion =
    item.insertTextFormat === InsertTextFormat.Snippet
      ? snippetCompletion(completionText(item), base)
      : base
  if (!offsets) return completion
  const defaultApply = completion.apply
  return {
    ...completion,
    apply: (view, selectedCompletion) => {
      if (typeof defaultApply === 'function') {
        defaultApply(view, selectedCompletion, offsets.from, offsets.to)
        return
      }
      const text = typeof defaultApply === 'string' ? defaultApply : selectedCompletion.label
      view.dispatch({
        ...insertCompletionText(view.state, text, offsets.from, offsets.to),
        annotations: pickedCompletion.of(selectedCompletion),
      })
    },
  }
}

export const mapEmbeddedCompletionItems = (
  state: EditorState,
  items: CompletionItem[],
  fallbackFrom: number,
): CompletionResult & { options: Completion[] } => {
  const offsets = items.map((item) => completionOffsets(state, item))
  const firstOffsets = offsets[0]
  const sharedOffsets =
    firstOffsets != null &&
    offsets.every(
      (itemOffsets) =>
        itemOffsets?.from === firstOffsets.from && itemOffsets.to === firstOffsets.to,
    )
      ? firstOffsets
      : null
  return {
    from: sharedOffsets?.from ?? fallbackFrom,
    to: sharedOffsets?.to,
    options: items.map((item, index) => mapCompletion(item, offsets[index] ?? null)),
  }
}
