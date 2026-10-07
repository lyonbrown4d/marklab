import { createPlateEditor } from 'platejs/react'
import type { PlateInlineCompletionResult } from '@/components/plate/completion/types'

export const createCompletionEditor = (text = 'I plan to') => {
  const editor = createPlateEditor({
    value: [{ type: 'p', children: [{ text }] }],
  })
  editor.tf.select({
    anchor: { path: [0, 0], offset: text.length },
    focus: { path: [0, 0], offset: text.length },
  })
  return editor
}

export const deferredCompletion = () => {
  let resolve: (value: PlateInlineCompletionResult) => void = () => undefined
  const promise = new Promise<PlateInlineCompletionResult>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

export const settleCompletion = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
