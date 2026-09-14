import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphTitleFocus } from '@/pages/useGraphTitleFocus'

const setup = () => {
  const ref = createRef<HTMLDivElement>()
  const view = (showTitle = false) => (
    <div>
      <div ref={ref} tabIndex={0} data-testid="graph">
        {showTitle && (
          <div data-graph-node-id="new">
            <div
              data-testid="title"
              data-markdown-block-role="title"
              contentEditable
              suppressContentEditableWarning
            >
              New heading
            </div>
          </div>
        )}
      </div>
      <input data-testid="other" />
    </div>
  )
  const dom = render(view())
  screen.getByTestId('graph').focus()
  const hook = renderHook(() => useGraphTitleFocus(ref))
  return { ...hook, mountTitle: () => dom.rerender(view(true)) }
}
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('graph title focus', () => {
  it('edits a title that mounts later than two animation frames', () => {
    const { result, mountTitle } = setup()
    act(() => result.current.focusHeadingTitleSoon('new'))
    advance(80)
    mountTitle()
    advance(32)
    expect(screen.getByTestId('title')).toHaveFocus()
    expect(window.getSelection()?.toString()).toBe('New heading')
  })

  it('focuses an existing title synchronously', () => {
    const { result, mountTitle } = setup()
    expect(result.current.focusHeadingTitle(null)).toBe(false)
    expect(result.current.focusHeadingTitle('absent')).toBe(false)
    mountTitle()
    act(() => expect(result.current.focusHeadingTitle('new')).toBe(true))
    expect(screen.getByTestId('title')).toHaveFocus()
  })

  it.each(['keyboard', 'pointer', 'focus'] as const)(
    'does not steal focus after a new %s interaction',
    (interaction) => {
      const { result, mountTitle } = setup()
      act(() => result.current.focusHeadingTitleSoon('new'))
      if (interaction === 'keyboard')
        fireEvent.keyDown(screen.getByTestId('graph'), { key: 'ArrowDown' })
      if (interaction === 'pointer') fireEvent.pointerDown(screen.getByTestId('graph'))
      if (interaction === 'focus') screen.getByTestId('other').focus()
      mountTitle()
      advance(64)
      expect(screen.getByTestId('title')).not.toHaveFocus()
    },
  )

  it('expires a missing title instead of waiting indefinitely', () => {
    const { result, mountTitle } = setup()
    act(() => result.current.focusHeadingTitleSoon('new'))
    advance(1100)
    mountTitle()
    advance(64)
    expect(screen.getByTestId('title')).not.toHaveFocus()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a superseded request, including a null selection', () => {
    const { result, mountTitle } = setup()
    act(() => {
      result.current.focusHeadingTitleSoon('new')
      result.current.focusHeadingTitleSoon(null)
    })
    mountTitle()
    advance(64)
    expect(screen.getByTestId('title')).not.toHaveFocus()
  })

  it('cleans up pending focus on unmount', () => {
    const { result, unmount, mountTitle } = setup()
    act(() => result.current.focusHeadingTitleSoon('new'))
    unmount()
    mountTitle()
    advance(64)
    expect(screen.getByTestId('title')).not.toHaveFocus()
    expect(vi.getTimerCount()).toBe(0)
  })
})
