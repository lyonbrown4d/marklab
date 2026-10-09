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
  })

  it('replaces the committed editor after a 140ms transition', () => {
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

    expect(screen.getByRole('status')).toHaveTextContent('Preparing editor…')
    act(() => vi.advanceTimersByTime(70))
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your position…')
    act(() => vi.advanceTimersByTime(69))
    expect(screen.getByText('Document one')).toBeVisible()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('Document two')).toBeVisible()
    expect(screen.queryByText('Document one')).not.toBeInTheDocument()
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

  it('ignores a stale transition when users switch files quickly', () => {
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

    expect(screen.getByText('Document one')).toBeVisible()
    expect(screen.queryByText('Document two')).not.toBeInTheDocument()
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
    act(() => vi.advanceTimersByTime(140))
    act(() => vi.runOnlyPendingTimers())

    expect(screen.getByRole('button', { name: 'Document two editor' })).toHaveFocus()
  })
})
