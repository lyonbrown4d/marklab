import { act, render, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorFocusHandoffProvider, useEditorFocusHandoffTarget } from '@/app/EditorFocusHandoff'
import { WorkspacePaneContext, type WorkspacePane } from '@/features/workbench/paneContext'

const Target = ({ focus }: { focus: () => void }) => {
  useEditorFocusHandoffTarget({ focus, path: 'shared.md', view: 'edit', status: 'ready' })
  return null
}

describe('workbench editor focus handoff', () => {
  it('uses the latest focus request when the editor finishes loading asynchronously', () => {
    let pending = false
    const focus = vi.fn()
    const complete = vi.fn((_id: number, applyFocus: () => void) => applyFocus())
    const { result, rerender } = renderHook(
      () =>
        useEditorFocusHandoffTarget({
          focus,
          path: 'shared.md',
          view: 'edit',
          status: 'loading',
        }),
      {
        wrapper: ({ children }) => (
          <EditorFocusHandoffProvider
            value={{
              complete,
              fail: vi.fn(),
              request: pending
                ? {
                    id: 1,
                    path: 'shared.md',
                    view: 'edit',
                    allowFocus: true,
                    origin: null,
                  }
                : null,
            }}
          >
            {children}
          </EditorFocusHandoffProvider>
        ),
      },
    )
    const delayedReady = result.current.reportReady
    pending = true
    rerender()
    act(delayedReady)
    expect(complete).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })
  it('ignores a delayed mount callback captured before the editor became inactive', () => {
    const focus = vi.fn()
    const complete = vi.fn((_id: number, applyFocus: () => void) => applyFocus())
    const { result, rerender } = renderHook(
      ({ active }) =>
        useEditorFocusHandoffTarget({
          active,
          focus,
          path: 'shared.md',
          view: 'edit',
          status: 'loading',
        }),
      {
        initialProps: { active: true },
        wrapper: ({ children }) => (
          <EditorFocusHandoffProvider
            value={{
              complete,
              fail: vi.fn(),
              request: {
                id: 1,
                path: 'shared.md',
                view: 'edit',
                allowFocus: true,
                origin: null,
              },
            }}
          >
            {children}
          </EditorFocusHandoffProvider>
        ),
      },
    )
    const delayedReady = result.current.reportReady
    rerender({ active: false })
    act(delayedReady)
    expect(complete).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })
  it('lets only the active pane satisfy a shared document request', () => {
    const passiveFocus = vi.fn()
    const activeFocus = vi.fn()
    const complete = vi.fn((_id: number, focus: () => void) => focus())
    const pane = (id: string, active: boolean): WorkspacePane => ({
      id,
      active,
      visible: true,
      recoveryKey: 0,
      registerFlush: () => () => undefined,
      openFile: vi.fn(),
      openBeside: vi.fn(),
    })
    render(
      <EditorFocusHandoffProvider
        value={{
          complete,
          fail: vi.fn(),
          request: {
            id: 1,
            path: 'shared.md',
            view: 'edit',
            allowFocus: true,
            origin: null,
          },
        }}
      >
        <WorkspacePaneContext.Provider value={pane('passive', false)}>
          <Target focus={passiveFocus} />
        </WorkspacePaneContext.Provider>
        <WorkspacePaneContext.Provider value={pane('active', true)}>
          <Target focus={activeFocus} />
        </WorkspacePaneContext.Provider>
      </EditorFocusHandoffProvider>,
    )
    expect(passiveFocus).not.toHaveBeenCalled()
    expect(activeFocus).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledOnce()
  })
})
