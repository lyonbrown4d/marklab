import { act, renderHook } from '@testing-library/react'
import type { Value } from 'platejs'
import { describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => ({
  requests: [] as Array<{ markdown: string; resolve: (value: Value) => void }>,
}))

vi.mock('@/services/plateMarkdownWorkerClient', () => ({
  loadPlateMarkdown: (_editor: unknown, markdown: string) =>
    new Promise<Value>((resolve) => workerMock.requests.push({ markdown, resolve })),
}))

import { usePlateAsyncInitialValue } from '@/components/plate/usePlateAsyncInitialValue'

describe('usePlateAsyncInitialValue', () => {
  it('binds initial parsing to the editor instead of reparsing a local value echo', async () => {
    const editor = {
      api: { onChange: vi.fn() },
      children: [] as Value,
      history: { redos: [], undos: [] },
      marks: null,
      operations: [],
      selection: null,
    }
    const { rerender, result } = renderHook(
      ({ value }) =>
        usePlateAsyncInitialValue({
          editor: editor as never,
          enabled: true,
          value,
        }),
      { initialProps: { value: 'Initial' } },
    )
    expect(result.current).toBe(false)

    await act(async () => {
      workerMock.requests[0]?.resolve([{ type: 'p', children: [{ text: 'Initial' }] }])
      await Promise.resolve()
    })
    expect(result.current).toBe(true)
    expect(editor.api.onChange).toHaveBeenCalledOnce()

    rerender({ value: 'Local echo' })

    expect(workerMock.requests).toHaveLength(1)
    expect(editor.api.onChange).toHaveBeenCalledOnce()
    expect(result.current).toBe(true)
  })
})
