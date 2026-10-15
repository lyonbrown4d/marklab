import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import { useGitDiffEditorLifecycle } from '@/features/git/useGitDiffEditorLifecycle'

describe('read-only Git diff model ownership', () => {
  it('detaches both models from the widget before disposing them', () => {
    const order: string[] = []
    const original = { isDisposed: () => false, dispose: vi.fn(() => order.push('original')) }
    const modified = { isDisposed: () => false, dispose: vi.fn(() => order.push('modified')) }
    let attached: unknown = { original, modified }
    const widget = {
      getModel: () => attached,
      setModel: vi.fn((model: unknown) => {
        attached = model
        order.push('detach')
      }),
    }
    const hook = renderHook(useGitDiffEditorLifecycle)
    hook.result.current.onMount(widget as unknown as editor.IStandaloneDiffEditor)
    hook.unmount()
    expect(order).toEqual(['detach', 'original', 'modified'])
    expect(attached).toBeNull()
  })
  it('gives simultaneous previews distinct model namespaces and tolerates an editor that never mounted', () => {
    const first = renderHook(useGitDiffEditorLifecycle)
    const second = renderHook(useGitDiffEditorLifecycle)
    expect(first.result.current.instanceId).not.toBe(second.result.current.instanceId)
    expect(() => first.unmount()).not.toThrow()
    expect(() => second.unmount()).not.toThrow()
  })

  it('also releases text models when a file switches to a non-text preview', () => {
    const original = { isDisposed: () => false, dispose: vi.fn() }
    const modified = { isDisposed: () => false, dispose: vi.fn() }
    let attached: unknown = { original, modified }
    const widget = {
      getModel: () => attached,
      setModel: vi.fn((value: unknown) => {
        attached = value
      }),
    }
    const hook = renderHook(({ active }) => useGitDiffEditorLifecycle(active), {
      initialProps: { active: true },
    })
    hook.result.current.onMount(widget as unknown as editor.IStandaloneDiffEditor)
    hook.rerender({ active: false })
    expect(attached).toBeNull()
    expect(original.dispose).toHaveBeenCalledOnce()
    expect(modified.dispose).toHaveBeenCalledOnce()
    hook.unmount()
    expect(original.dispose).toHaveBeenCalledOnce()
  })
})
