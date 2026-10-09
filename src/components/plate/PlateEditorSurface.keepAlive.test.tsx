import { act, render } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

describe('PlateEditorSurface cached route lifecycle', () => {
  it('does not publish snapshots from an inactive cached editor', async () => {
    vi.useFakeTimers()
    const ref = createRef<PlateEditorSurfaceHandle>()
    const onChange = vi.fn()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        interactionActive={false}
        onChange={onChange}
        placeholder="Write"
        ref={ref}
        value="Before"
      />,
    )
    const editor = ref.current?.getEditor()

    await act(async () => {
      editor?.tf.select({
        anchor: { offset: 6, path: [0, 0] },
        focus: { offset: 6, path: [0, 0] },
      })
      editor?.tf.insertText(' stale')
      await vi.advanceTimersByTimeAsync(1_000)
    })

    vi.useRealTimers()
    expect(onChange).not.toHaveBeenCalled()
  })
})
