import type { Value } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { describe, expect, it, vi } from 'vitest'
import {
  appendPlateEditorValue,
  finalizePatchedPlateEditorValue,
  patchPlateEditorValue,
  reconcilePlateEditorValue,
} from '@/components/plate/plateEditorValueHydration'

const paragraph = (text: string, id: string) => ({
  children: [{ text }],
  id,
  type: 'p',
})

const createEditor = (children: Value, onApply?: () => void) =>
  ({
    apply: vi.fn(
      (operation: {
        offset: number
        path: number[]
        text: string
        type: 'insert_text' | 'remove_text'
      }) => {
        let node: unknown = children
        for (const segment of operation.path) {
          node = Array.isArray(node)
            ? node[segment]
            : (node as { children: unknown[] }).children[segment]
        }
        const textNode = node as { text: string }
        textNode.text =
          operation.type === 'remove_text'
            ? `${textNode.text.slice(0, operation.offset)}${textNode.text.slice(operation.offset + operation.text.length)}`
            : `${textNode.text.slice(0, operation.offset)}${operation.text}${textNode.text.slice(operation.offset)}`
        onApply?.()
      },
    ),
    api: { onChange: vi.fn() },
    children,
    tf: {
      insertNodes: vi.fn((node, options: { at: number[] }) => {
        children.splice(options.at[0], 0, node)
      }),
      removeNodes: vi.fn((options: { at: number[] }) => {
        children.splice(options.at[0], 1)
      }),
      withoutNormalizing: (apply: () => void) => apply(),
    },
  }) as unknown as PlateEditor

describe('Plate editor value hydration patches', () => {
  it('keeps external apply suppression active through streamed change microtasks', async () => {
    const externalApplyRef = { current: false }
    const observedSuppression: boolean[] = []
    const editor = createEditor([], () => undefined)
    editor.api.onChange = vi.fn(() =>
      queueMicrotask(() => observedSuppression.push(externalApplyRef.current)),
    )

    await appendPlateEditorValue(
      editor,
      [paragraph('streamed', 'streamed-block')] as Value,
      true,
      externalApplyRef,
    )

    expect(observedSuppression).toEqual([true])
    expect(externalApplyRef.current).toBe(false)
  })

  it('reuses semantically equal nodes while ignoring generated ids', () => {
    const current = [paragraph('same', 'current')] as Value
    const next = [paragraph('same', 'parsed')] as Value

    expect(reconcilePlateEditorValue(current, next, 0)[0]).toBe(current[0])
  })

  it('updates only changed slices and skips unchanged commits', async () => {
    const current = [paragraph('one', '1'), paragraph('two', '2')] as Value
    const editor = createEditor([...current])

    await expect(patchPlateEditorValue(editor, [current[0]], 0)).resolves.toBe(false)
    expect(editor.tf.removeNodes).not.toHaveBeenCalled()

    const changed = { children: [{ text: 'changed' }], id: 'next', type: 'h1' }
    await expect(patchPlateEditorValue(editor, [changed], 1)).resolves.toBe(true)
    expect(editor.children).toEqual([current[0], changed])
    expect(editor.tf.removeNodes).toHaveBeenCalledOnce()
    expect(editor.tf.insertNodes).toHaveBeenCalledOnce()
  })

  it('patches text-only changes at the leaf path without replacing the top-level block', async () => {
    const current = paragraph('before', 'stable-block')
    const editor = createEditor([current] as Value)
    const next = paragraph('after', 'parsed-block')

    await expect(patchPlateEditorValue(editor, [next], 0)).resolves.toBe(true)

    expect(editor.children[0]).toBe(current)
    expect(editor.children[0]).toMatchObject({ children: [{ text: 'after' }] })
    expect(editor.apply).toHaveBeenCalledWith({
      offset: 0,
      path: [0, 0],
      text: 'before',
      type: 'remove_text',
    })
    expect(editor.apply).toHaveBeenCalledWith({
      offset: 0,
      path: [0, 0],
      text: 'after',
      type: 'insert_text',
    })
    expect(editor.tf.removeNodes).not.toHaveBeenCalled()
    expect(editor.tf.insertNodes).not.toHaveBeenCalled()
  })

  it('keeps external apply suppression active through Slate change microtasks', async () => {
    const externalApplyRef = { current: false }
    const observedSuppression: boolean[] = []
    const editor = createEditor([paragraph('before', 'stable-block')] as Value, () =>
      queueMicrotask(() => observedSuppression.push(externalApplyRef.current)),
    )

    await patchPlateEditorValue(editor, [paragraph('after', 'parsed-block')], 0, externalApplyRef)

    expect(observedSuppression).toEqual([true, true])
    expect(externalApplyRef.current).toBe(false)
  })

  it('keeps suppression active when a later Slate operation throws', async () => {
    const externalApplyRef = { current: false }
    const observedSuppression: boolean[] = []
    let operationCount = 0
    const editor = createEditor([paragraph('before', 'stable-block')] as Value, () => {
      operationCount += 1
      queueMicrotask(() => observedSuppression.push(externalApplyRef.current))
      if (operationCount === 2) throw new Error('operation failed')
    })

    await expect(
      patchPlateEditorValue(editor, [paragraph('after', 'parsed-block')], 0, externalApplyRef),
    ).rejects.toThrow('operation failed')

    expect(observedSuppression).toEqual([true, true])
    expect(externalApplyRef.current).toBe(false)
  })

  it('trims nodes left over from a shorter restored document', async () => {
    const editor = createEditor([paragraph('one', '1'), paragraph('two', '2')] as Value)

    await expect(finalizePatchedPlateEditorValue(editor, 1)).resolves.toBe(true)
    expect(editor.children).toHaveLength(1)
    expect(editor.tf.removeNodes).toHaveBeenCalledOnce()
  })
})
