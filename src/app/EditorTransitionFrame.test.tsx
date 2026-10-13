import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorTransitionFrame } from '@/app/EditorTransitionFrame'

const NativeInertContext = createContext(false)

const NativeInertFocusTarget = ({ children }: { children: string }) => {
  const inert = useContext(NativeInertContext)
  const ref = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (inert) ref.current?.blur()
  }, [inert])

  return (
    <button ref={ref} type="button">
      {children}
    </button>
  )
}

describe('EditorTransitionFrame', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps the committed editor visible and inert while the next file loads', () => {
    const view = render(
      <EditorTransitionFrame requestKey="one" status="ready">
        <div>Document one</div>
      </EditorTransitionFrame>,
    )

    view.rerender(
      <EditorTransitionFrame requestKey="two" status="loading">
        <div>Document two</div>
      </EditorTransitionFrame>,
    )

    expect(screen.getByText('Document one')).toBeVisible()
    expect(screen.queryByText('Document two')).not.toBeInTheDocument()
    expect(screen.getByTestId('editor-transition-content')).toHaveAttribute('inert')
    expect(screen.getByRole('status')).toHaveTextContent('Loading document…')
    expect(screen.getByRole('status').querySelector('[data-document-loading]')).not.toBeNull()
  })

  it('shows ready content immediately without artificial preparation timers', () => {
    const view = render(
      <EditorTransitionFrame requestKey="one" status="ready">
        <div>Document one</div>
      </EditorTransitionFrame>,
    )
    view.rerender(
      <EditorTransitionFrame requestKey="two" status="loading">
        <div>Document two</div>
      </EditorTransitionFrame>,
    )
    view.rerender(
      <EditorTransitionFrame requestKey="two" status="ready">
        <div>Document two</div>
      </EditorTransitionFrame>,
    )

    expect(screen.getByText('Document two')).toBeVisible()
    expect(screen.queryByText('Document one')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByTestId('editor-transition-content')).not.toHaveAttribute('inert')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps rendering live updates within the committed surface', () => {
    const view = render(
      <EditorTransitionFrame requestKey="workspace-map" status="ready">
        <div>Inactive map node</div>
      </EditorTransitionFrame>,
    )

    view.rerender(
      <EditorTransitionFrame requestKey="workspace-map" status="ready">
        <div>Active map editor</div>
      </EditorTransitionFrame>,
    )

    expect(screen.getByText('Active map editor')).toBeVisible()
    expect(screen.queryByText('Inactive map node')).not.toBeInTheDocument()
  })

  it('keeps the latest ready document during rapid switches', () => {
    const view = render(
      <EditorTransitionFrame requestKey="one" status="ready">
        <div>Document one</div>
      </EditorTransitionFrame>,
    )
    view.rerender(
      <EditorTransitionFrame requestKey="two" status="ready">
        <div>Document two</div>
      </EditorTransitionFrame>,
    )
    view.rerender(
      <EditorTransitionFrame requestKey="three" status="loading">
        <div>Document three</div>
      </EditorTransitionFrame>,
    )
    act(() => vi.advanceTimersByTime(200))

    expect(screen.getByText('Document two')).toBeVisible()
    expect(screen.queryByText('Document one')).not.toBeInTheDocument()
    expect(screen.queryByText('Document three')).not.toBeInTheDocument()
  })

  it('keeps the previous editor on failure and exposes a retry action', () => {
    const retry = vi.fn()
    const view = render(
      <EditorTransitionFrame requestKey="one" status="ready">
        <div>Document one</div>
      </EditorTransitionFrame>,
    )
    view.rerender(
      <EditorTransitionFrame
        errorMessage="Disk unavailable"
        onRetry={retry}
        requestKey="two"
        status="error"
      >
        <div>Document two</div>
      </EditorTransitionFrame>,
    )

    expect(screen.getByText('Document one')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Disk unavailable')
    expect(screen.getByRole('group')).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByTestId('editor-transition-content')).toHaveAttribute('inert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('commits immediately when reduced motion is requested', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    const view = render(
      <EditorTransitionFrame requestKey="one" status="ready">
        <div>Document one</div>
      </EditorTransitionFrame>,
    )
    view.rerender(
      <EditorTransitionFrame requestKey="two" status="ready">
        <div>Document two</div>
      </EditorTransitionFrame>,
    )

    expect(screen.getByText('Document two')).toBeVisible()
    expect(screen.queryByText('Document one')).not.toBeInTheDocument()
  })

  it('moves focus out of stale content and restores it to the committed editor', () => {
    const view = render(
      <NativeInertContext.Provider value={false}>
        <EditorTransitionFrame requestKey="one" status="ready">
          <NativeInertFocusTarget>Document one editor</NativeInertFocusTarget>
        </EditorTransitionFrame>
      </NativeInertContext.Provider>,
    )
    screen.getByRole('button', { name: 'Document one editor' }).focus()

    view.rerender(
      <NativeInertContext.Provider value>
        <EditorTransitionFrame requestKey="two" status="loading">
          <NativeInertFocusTarget>Document two editor</NativeInertFocusTarget>
        </EditorTransitionFrame>
      </NativeInertContext.Provider>,
    )
    expect(screen.getByTestId('editor-transition-content').parentElement).toHaveFocus()
    expect(screen.getByTestId('editor-transition-content').parentElement).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByTestId('editor-transition-content').parentElement).toHaveAccessibleName(
      'Loading document…',
    )

    view.rerender(
      <NativeInertContext.Provider value>
        <EditorTransitionFrame requestKey="two" status="ready">
          <NativeInertFocusTarget>Document two editor</NativeInertFocusTarget>
        </EditorTransitionFrame>
      </NativeInertContext.Provider>,
    )
    expect(screen.getByRole('button', { name: 'Document two editor' })).toHaveFocus()
  })

  it('retains the latest live content and editor DOM state during loading and failure', () => {
    const view = render(
      <EditorTransitionFrame requestKey="one" status="ready">
        <textarea aria-label="Editor" defaultValue="Initial draft" />
      </EditorTransitionFrame>,
    )
    const editor = screen.getByRole('textbox', { name: 'Editor' })
    fireEvent.change(editor, { target: { value: 'Unsaved draft' } })
    editor.scrollTop = 42
    view.rerender(
      <EditorTransitionFrame requestKey="one" status="ready">
        <textarea aria-label="Editor" defaultValue="Initial draft" />
        <div>Latest editor update</div>
      </EditorTransitionFrame>,
    )
    for (const status of ['loading', 'error'] as const) {
      view.rerender(
        <EditorTransitionFrame requestKey="two" status={status}>
          <div>Unavailable document</div>
        </EditorTransitionFrame>,
      )
      expect(screen.getByText('Latest editor update')).toBeVisible()
      expect(screen.getByRole('textbox', { name: 'Editor' })).toBe(editor)
      expect(editor).toHaveValue('Unsaved draft')
      expect(editor.scrollTop).toBe(42)
    }
    view.rerender(
      <EditorTransitionFrame requestKey="two" status="ready">
        <div>Recovered document</div>
      </EditorTransitionFrame>,
    )
    expect(screen.getByText('Recovered document')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not take focus back after the user moves outside during rapid loading', () => {
    const view = render(
      <>
        <button type="button">Sidebar</button>
        <EditorTransitionFrame requestKey="one" status="ready">
          <button type="button">Document one editor</button>
        </EditorTransitionFrame>
      </>,
    )
    screen.getByRole('button', { name: 'Document one editor' }).focus()
    const update = (requestKey: string, status: 'loading' | 'ready') => {
      view.rerender(
        <>
          <button type="button">Sidebar</button>
          <EditorTransitionFrame requestKey={requestKey} status={status}>
            <button type="button">Next document editor</button>
          </EditorTransitionFrame>
        </>,
      )
    }
    update('two', 'loading')
    const sidebar = screen.getByRole('button', { name: 'Sidebar' })
    sidebar.focus()
    update('three', 'loading')
    expect(sidebar).toHaveFocus()
    sidebar.blur()
    update('three', 'ready')
    expect(screen.getByRole('button', { name: 'Next document editor' })).not.toHaveFocus()
  })

  it('does not focus the editor when a transition begins outside it', () => {
    const view = render(
      <EditorTransitionFrame requestKey="one" status="loading">
        <button type="button">Editor</button>
      </EditorTransitionFrame>,
    )
    view.rerender(
      <EditorTransitionFrame requestKey="one" status="ready">
        <button type="button">Editor</button>
      </EditorTransitionFrame>,
    )
    expect(screen.getByRole('button', { name: 'Editor' })).not.toHaveFocus()
  })

  it('preserves existing editor focus during an immediate ready switch', () => {
    const children = (
      <>
        <button type="button">First editor control</button>
        <textarea aria-label="Active editor" />
      </>
    )
    const view = render(
      <EditorTransitionFrame requestKey="one" status="ready">
        {children}
      </EditorTransitionFrame>,
    )
    const editor = screen.getByRole('textbox', { name: 'Active editor' })
    editor.focus()
    view.rerender(
      <EditorTransitionFrame requestKey="two" status="ready">
        {children}
      </EditorTransitionFrame>,
    )
    expect(editor).toHaveFocus()
  })
})
