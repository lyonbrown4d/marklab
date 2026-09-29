import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppTerminalArea } from '@/app/useAppTerminalArea'

describe('useAppTerminalArea', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('can close immediately after opening and restores focus to the trigger', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const trigger = document.createElement('button')
    const terminalInput = document.createElement('textarea')
    document.body.append(trigger, terminalInput)
    trigger.focus()
    const { result } = renderHook(() => useAppTerminalArea({ disabled: false }))

    act(() => result.current.openTerminalArea())
    terminalInput.focus()
    act(() => result.current.closeTerminalArea())

    expect(result.current.effectiveTerminalOpen).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('issues a fresh focus request when open is invoked repeatedly', () => {
    const { result } = renderHook(() => useAppTerminalArea({ disabled: false }))

    expect(result.current.terminalFocusRequest).toBe(0)
    act(() => result.current.openTerminalArea())
    expect(result.current.terminalFocusRequest).toBe(1)
    act(() => result.current.openTerminalArea())
    expect(result.current.terminalFocusRequest).toBe(2)
  })
})
