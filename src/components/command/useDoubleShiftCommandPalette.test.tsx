import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDoubleShiftCommandPalette } from '@/components/command/useDoubleShiftCommandPalette'

const Harness = ({ enabled = true, onOpen }: { enabled?: boolean; onOpen: () => void }) => {
  useDoubleShiftCommandPalette({ enabled, onOpen })
  return null
}

const tapShift = () => {
  fireEvent.keyDown(window, { key: 'Shift' })
  fireEvent.keyUp(window, { key: 'Shift' })
}

describe('useDoubleShiftCommandPalette', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens once after two clean Shift taps, but not after one', () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)

    tapShift()
    expect(onOpen).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    tapShift()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('resets the first tap when the window blurs', () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)

    tapShift()
    fireEvent.blur(window)
    vi.advanceTimersByTime(100)
    tapShift()

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('does not open when the command palette is unavailable', () => {
    const onOpen = vi.fn()
    render(<Harness enabled={false} onOpen={onOpen} />)

    tapShift()
    tapShift()

    expect(onOpen).not.toHaveBeenCalled()
  })

  it.each([
    ['dialog', <div role="dialog" />],
    ['alert dialog', <div role="alertdialog" />],
    ['aria modal', <div aria-modal="true" />],
  ])('does not open over an existing %s', (_label, modal) => {
    const onOpen = vi.fn()
    render(
      <>
        {modal}
        <Harness onOpen={onOpen} />
      </>,
    )

    tapShift()
    tapShift()

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('does not mistake a held Shift key for a second tap', () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)

    tapShift()
    fireEvent.keyDown(window, { key: 'Shift' })
    fireEvent.keyDown(window, { key: 'Shift', repeat: true })
    fireEvent.keyUp(window, { key: 'Shift' })

    expect(onOpen).not.toHaveBeenCalled()
  })
})
