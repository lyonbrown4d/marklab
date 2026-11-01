import type { editor as MonacoEditor } from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  retainSourceModel,
  useWorkbenchSourceModel,
} from '@/components/source-code/useWorkbenchSourceModel'

describe('workbench shared source model lifetime', () => {
  it('preserves shared model history until the last pane detaches, including a dock move', async () => {
    const dispose = vi.fn()
    const model = { dispose, isDisposed: () => false } as unknown as MonacoEditor.ITextModel
    const releaseFirst = retainSourceModel(model)
    const releaseSecond = retainSourceModel(model)
    releaseFirst()
    await Promise.resolve()
    expect(dispose).not.toHaveBeenCalled()
    releaseSecond()
    const releaseMoved = retainSourceModel(model)
    await Promise.resolve()
    expect(dispose).not.toHaveBeenCalled()
    releaseMoved()
    releaseMoved()
    await Promise.resolve()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('restores each pane view separately while keeping the document model shared', async () => {
    let disposed = false
    const model = {
      uri: { toString: () => 'marklab-source://shared/document.md' },
      isDisposed: () => disposed,
      dispose: vi.fn(() => {
        disposed = true
      }),
    } as unknown as MonacoEditor.ITextModel
    const host = (scrollTop: number) => {
      const view = { viewState: { scrollTop } } as unknown as MonacoEditor.ICodeEditorViewState
      const restoreViewState = vi.fn()
      const editor = {
        getModel: () => model,
        saveViewState: () => view,
        restoreViewState,
        onWillChangeModel: () => ({ dispose: vi.fn() }),
        onDidChangeModel: () => ({ dispose: vi.fn() }),
      } as unknown as MonacoEditor.IStandaloneCodeEditor
      return { editor, view, restoreViewState }
    }
    const firstHost = host(100)
    const secondHost = host(500)
    const first = renderHook(() => useWorkbenchSourceModel(firstHost.editor, 'first'))
    const second = renderHook(() => useWorkbenchSourceModel(secondHost.editor, 'second'))
    first.unmount()
    const restoredHost = host(0)
    const restored = renderHook(() => useWorkbenchSourceModel(restoredHost.editor, 'first'))
    expect(restoredHost.restoreViewState).toHaveBeenCalledExactlyOnceWith(firstHost.view)
    expect(secondHost.restoreViewState).not.toHaveBeenCalled()
    second.unmount()
    await Promise.resolve()
    expect(model.dispose).not.toHaveBeenCalled()
    restored.unmount()
    await Promise.resolve()
    expect(model.dispose).toHaveBeenCalledOnce()
  })
})
