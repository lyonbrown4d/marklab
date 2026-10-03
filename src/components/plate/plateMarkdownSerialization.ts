import { deserializeMd, serializeMd } from '@platejs/markdown'
import type { SlateEditor, Value } from 'platejs'

export const deserializePlateMarkdown = (editor: SlateEditor, markdown: string) =>
  deserializeMd(editor, markdown, { withoutMdx: true })

export const serializePlateMarkdown = (editor: SlateEditor, value?: Value) =>
  serializeMd(editor, value ? { value } : undefined)
