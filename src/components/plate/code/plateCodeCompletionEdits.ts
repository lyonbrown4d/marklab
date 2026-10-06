import type { Path, Point, TElement, TText } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { InsertTextFormat, type CompletionItem, type Position } from 'vscode-languageserver-types'

export const pointToEmbeddedPosition = (blockPath: Path, point: Point): Position | null => {
  if (point.path.length < blockPath.length + 2) return null
  if (!blockPath.every((part, index) => point.path[index] === part)) return null
  const line = point.path[blockPath.length]
  if (typeof line !== 'number') return null
  return { line, character: point.offset }
}

const completionRange = (item: CompletionItem) => {
  const edit = item.textEdit
  if (!edit) return null
  return 'range' in edit ? edit.range : edit.replace
}

const completionText = (item: CompletionItem) => {
  const edit = item.textEdit
  const text = edit?.newText ?? item.insertText ?? item.label
  if (item.insertTextFormat !== InsertTextFormat.Snippet) return text
  return text
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '')
}

const nodeText = (node: TElement | TText): string => {
  if ('text' in node) return typeof node.text === 'string' ? node.text : ''
  return node.children.map((child) => nodeText(child as TElement | TText)).join('')
}

export const readPlateCodeSource = (editor: PlateEditor, blockPath: Path) => {
  const entry = editor.api.node<TElement>(blockPath)
  if (!entry) return null
  return entry[0].children.map((child) => nodeText(child as TElement | TText)).join('\n')
}

export const replacePlateCodeSource = (
  editor: PlateEditor,
  blockPath: Path,
  nextSource: string,
) => {
  const entry = editor.api.node<TElement>(blockPath)
  if (!entry) return false
  const currentSource = entry[0].children
    .map((child) => nodeText(child as TElement | TText))
    .join('\n')
  if (currentSource === nextSource) return false
  const nextLines = nextSource.split('\n').map((text) => ({
    type: 'code_line',
    children: [{ text }],
  }))
  const selection = editor.selection
  const selectionInBlock =
    selection &&
    [selection.anchor, selection.focus].every(
      (point) =>
        point.path.length >= blockPath.length + 2 &&
        blockPath.every((part, index) => point.path[index] === part),
    )
  editor.tf.withoutNormalizing(() => {
    for (let index = entry[0].children.length - 1; index >= 0; index -= 1) {
      editor.tf.removeNodes({ at: [...blockPath, index] })
    }
    editor.tf.insertNodes(nextLines, { at: [...blockPath, 0] })
  })
  if (selectionInBlock) {
    const restorePoint = (point: Point): Point => {
      const requestedLine = point.path[blockPath.length] ?? 0
      const line = Math.min(Math.max(requestedLine, 0), nextLines.length - 1)
      return {
        path: [...blockPath, line, 0],
        offset: Math.min(point.offset, nextLines[line]?.children[0]?.text.length ?? 0),
      }
    }
    editor.tf.select({
      anchor: restorePoint(selection.anchor),
      focus: restorePoint(selection.focus),
    })
  }
  return true
}

const positionToOffset = (lines: readonly string[], position: Position) => {
  if (position.line < 0 || position.line >= lines.length) return null
  const line = lines[position.line] ?? ''
  if (position.character < 0 || position.character > line.length) return null
  let offset = position.character
  for (let index = 0; index < position.line; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1
  }
  return offset
}

export const applyPlateCodeCompletion = (
  editor: PlateEditor,
  blockPath: Path,
  item: CompletionItem,
) => {
  const entry = editor.api.node<TElement>(blockPath)
  if (!entry) return false
  const lines = entry[0].children.map((child) => nodeText(child as TElement | TText))
  const source = lines.join('\n')
  const range = completionRange(item)
  const selectionPosition = editor.selection
    ? pointToEmbeddedPosition(blockPath, editor.selection.focus)
    : null
  const start = positionToOffset(
    lines,
    range?.start ?? selectionPosition ?? { line: 0, character: 0 },
  )
  const end = positionToOffset(lines, range?.end ?? selectionPosition ?? { line: 0, character: 0 })
  if (start == null || end == null || start > end) return false

  const replacementText = completionText(item)
  const nextSource = source.slice(0, start) + replacementText + source.slice(end)
  const nextLines = nextSource.split('\n').map((text) => ({
    type: 'code_line',
    children: [{ text }],
  }))
  if (range && range.start.line === range.end.line && !replacementText.includes('\n')) {
    editor.tf.select({
      anchor: { path: [...blockPath, range.start.line, 0], offset: range.start.character },
      focus: { path: [...blockPath, range.end.line, 0], offset: range.end.character },
    })
    editor.tf.insertText(replacementText)
  } else {
    editor.tf.withoutNormalizing(() => {
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        editor.tf.removeNodes({ at: [...blockPath, index] })
      }
      editor.tf.insertNodes(nextLines, { at: [...blockPath, 0] })
    })
  }

  const insertedEnd = start + replacementText.length
  const insertedPrefix = nextSource.slice(0, insertedEnd).split('\n')
  editor.tf.select({
    path: [...blockPath, insertedPrefix.length - 1, 0],
    offset: insertedPrefix.at(-1)?.length ?? 0,
  })
  editor.tf.focus()
  return true
}
