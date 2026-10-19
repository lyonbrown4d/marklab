import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutEffect, useRef } from 'react'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import type { WorkspaceMapEditorLoadState } from '@/logic/graph'
import {
  WorkspaceMapEditorPortal,
  WorkspaceMapEditorPortalProvider,
} from '@/pages/workspace-map/WorkspaceMapEditorPortal'

const surface = vi.hoisted(() => ({ current: null as PlateEditorSurfaceHandle | null }))

// Keep the actual Slate/Plate instance and history; omit unrelated Markdown chrome.
vi.mock('@/components/MarkdownEditor', () => {
  const MockMarkdownEditor = (
    props: import('@/components/editor/markdownEditorTypes').MarkdownEditorProps,
  ) => {
    const ref = useRef<PlateEditorSurfaceHandle>(null)
    useLayoutEffect(() => {
      surface.current = ref.current
    })
    return <PlateEditorSurface {...props} ref={ref} />
  }
  return { default: MockMarkdownEditor }
})

const onChange = vi.fn()
const onCloseEditor = vi.fn()
const onAncestorKey = vi.fn()
const onAncestorWheel = vi.fn()
const onAncestorClick = vi.fn()
const Harness = ({
  path = 'a.md',
  visible = true,
  loadState = { status: 'ready', content: 'Before' },
  workspaceKey = 'workspace:a',
}: {
  path?: string
  visible?: boolean
  loadState?: WorkspaceMapEditorLoadState
  workspaceKey?: string
}) => (
  <div onKeyDown={onAncestorKey} onWheel={onAncestorWheel} onClick={onAncestorClick}>
    <WorkspaceMapEditorPortalProvider
      activePath={path}
      editorLoadState={loadState}
      onChange={onChange}
      onCloseEditor={onCloseEditor}
      readOnly={false}
      visible={visible}
      workspaceKey={workspaceKey}
    >
      {visible && loadState.status === 'ready' ? (
        <WorkspaceMapEditorPortal
          activePath={path}
          onChange={onChange}
          readOnly={false}
          value={loadState.content}
        />
      ) : null}
    </WorkspaceMapEditorPortalProvider>
  </div>
)

describe('workspace map retained editor portal', () => {
  beforeEach(() => {
    surface.current = null
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('retains real editor content, selection and undo/redo across outlet removal', async () => {
    const view = render(<Harness />)
    await screen.findByTestId('workspace-map-editor-viewport')
    await waitFor(() => expect(surface.current).not.toBeNull())
    const handle = surface.current!
    const editor = handle.getEditor()
    act(() => {
      editor.tf.select({ anchor: { path: [0, 0], offset: 6 }, focus: { path: [0, 0], offset: 6 } })
      editor.tf.insertText(' unsaved')
    })
    const selection = structuredClone(editor.selection)
    await waitFor(async () => expect((await handle.getMarkdown()).trim()).toBe('Before unsaved'))

    view.rerender(<Harness visible={false} />)
    expect(screen.queryByTestId('workspace-map-editor-viewport')).toBeNull()
    expect(surface.current?.getEditor()).toBe(editor)
    view.rerender(<Harness />)
    expect(surface.current?.getEditor()).toBe(editor)
    expect(editor.selection).toEqual(selection)
    act(() => editor.undo())
    await waitFor(async () => expect((await handle.getMarkdown()).trim()).toBe('Before'))
    act(() => editor.redo())
    await waitFor(async () => expect((await handle.getMarkdown()).trim()).toBe('Before unsaved'))
    fireEvent.keyDown(screen.getByTestId('workspace-map-editor-viewport'), { key: 'Escape' })
    expect(onCloseEditor).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByTestId('workspace-map-editor-viewport'), {
      key: 'Escape',
      isComposing: true,
    })
    expect(onCloseEditor).toHaveBeenCalledOnce()
    const viewport = screen.getByTestId('workspace-map-editor-viewport')
    fireEvent.keyDown(viewport, { key: 'Escape', isComposing: true })
    expect(onCloseEditor).toHaveBeenCalledOnce()
    fireEvent.click(viewport)
    expect(onAncestorClick).not.toHaveBeenCalled()
    expect(onAncestorKey).not.toHaveBeenCalled()
    fireEvent.keyDown(viewport, { key: 'f', ctrlKey: true, shiftKey: true })
    expect(onAncestorKey).toHaveBeenCalledOnce()
    fireEvent.wheel(viewport, { deltaY: 20 })
    expect(onAncestorWheel).not.toHaveBeenCalled()
    fireEvent.wheel(viewport, { deltaY: 20, ctrlKey: true })
    expect(onAncestorWheel).toHaveBeenCalledOnce()
  })

  it('keeps the loaded editor through loading/error and replaces it on path/workspace change', async () => {
    const view = render(<Harness loadState={{ status: 'loading' }} />)
    expect(surface.current).toBeNull()
    view.rerender(<Harness />)
    await screen.findByTestId('workspace-map-editor-viewport')
    const editor = surface.current!.getEditor()
    view.rerender(<Harness loadState={{ status: 'loading' }} />)
    expect(surface.current?.getEditor()).toBe(editor)
    expect(screen.queryByRole('textbox')).toBeNull()
    view.rerender(<Harness loadState={{ status: 'error', message: 'disk error' }} />)
    expect(surface.current?.getEditor()).toBe(editor)
    view.rerender(<Harness />)
    expect(surface.current?.getEditor()).toBe(editor)
    expect((await surface.current!.getMarkdown()).trim()).toBe('Before')

    view.rerender(<Harness visible={false} />)
    vi.useFakeTimers()
    onChange.mockClear()
    await act(async () => {
      editor.tf.select({ anchor: { path: [0, 0], offset: 6 }, focus: { path: [0, 0], offset: 6 } })
      editor.tf.insertText(' stale')
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(onChange).not.toHaveBeenCalled()
    vi.useRealTimers()

    view.rerender(<Harness path="b.md" loadState={{ status: 'ready', content: 'Separate' }} />)
    await waitFor(() => expect(surface.current?.getEditor()).not.toBe(editor))
    expect((await surface.current!.getMarkdown()).trim()).toBe('Separate')
    expect(surface.current!.getEditor().history.undos).toHaveLength(0)
    const otherEditor = surface.current!.getEditor()
    view.rerender(
      <Harness
        path="b.md"
        workspaceKey="workspace:b"
        loadState={{ status: 'ready', content: 'Other workspace' }}
      />,
    )
    await waitFor(() => expect(surface.current?.getEditor()).not.toBe(otherEditor))
    expect((await surface.current!.getMarkdown()).trim()).toBe('Other workspace')
  })
})
