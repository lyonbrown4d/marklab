import { describe, expect, it } from 'vitest'
import {
  DOUBLE_SHIFT_INITIAL_STATE,
  reduceDoubleShiftGesture,
  type DoubleShiftGestureAction,
  type DoubleShiftGestureState,
} from '@/components/command/doubleShiftGesture'

const keyAction = (
  type: 'keydown' | 'keyup',
  now: number,
  overrides: Partial<Extract<DoubleShiftGestureAction, { type: 'keydown' | 'keyup' }>> = {},
): DoubleShiftGestureAction => ({
  type,
  key: 'Shift',
  now,
  altKey: false,
  ctrlKey: false,
  defaultPrevented: false,
  isComposing: false,
  metaKey: false,
  repeat: false,
  ...overrides,
})

const dispatch = (state: DoubleShiftGestureState, action: DoubleShiftGestureAction) =>
  reduceDoubleShiftGesture(state, action)

const tapShift = (state: DoubleShiftGestureState, start: number) => {
  const pressed = dispatch(state, keyAction('keydown', start))
  expect(pressed.shouldOpen).toBe(false)
  return dispatch(pressed.state, keyAction('keyup', start + 20))
}

describe('reduceDoubleShiftGesture', () => {
  it('opens only after two clean Shift taps within the threshold', () => {
    const first = tapShift(DOUBLE_SHIFT_INITIAL_STATE, 100)
    const second = tapShift(first.state, 420)

    expect(first.shouldOpen).toBe(false)
    expect(second.shouldOpen).toBe(true)
    expect(second.state).toEqual(DOUBLE_SHIFT_INITIAL_STATE)
  })

  it('starts a new sequence when the second tap is too late', () => {
    const first = tapShift(DOUBLE_SHIFT_INITIAL_STATE, 100)
    const late = tapShift(first.state, 600)

    expect(late.shouldOpen).toBe(false)
    expect(late.state.firstTapAt).toBe(620)
  })

  it('invalidates Shift used with another key', () => {
    const first = tapShift(DOUBLE_SHIFT_INITIAL_STATE, 100)
    const shiftDown = dispatch(first.state, keyAction('keydown', 200))
    const letterDown = dispatch(shiftDown.state, keyAction('keydown', 210, { key: 'A' }))
    const shiftUp = dispatch(letterDown.state, keyAction('keyup', 220))

    expect(shiftUp.shouldOpen).toBe(false)
    expect(shiftUp.state).toEqual(DOUBLE_SHIFT_INITIAL_STATE)
  })

  it.each([
    ['Ctrl+Shift', { ctrlKey: true }],
    ['Alt+Shift', { altKey: true }],
    ['Meta+Shift', { metaKey: true }],
    ['an IME-composing Shift', { isComposing: true }],
    ['a prevented Shift event', { defaultPrevented: true }],
  ])('invalidates %s', (_label, overrides) => {
    const first = tapShift(DOUBLE_SHIFT_INITIAL_STATE, 100)
    const invalid = dispatch(first.state, keyAction('keydown', 200, overrides))
    const released = dispatch(invalid.state, keyAction('keyup', 220))

    expect(released.shouldOpen).toBe(false)
    expect(released.state).toEqual(DOUBLE_SHIFT_INITIAL_STATE)
  })

  it('invalidates a held second Shift when key repeat starts', () => {
    const first = tapShift(DOUBLE_SHIFT_INITIAL_STATE, 100)
    const secondPress = dispatch(first.state, keyAction('keydown', 200))
    const repeated = dispatch(secondPress.state, keyAction('keydown', 250, { repeat: true }))
    const released = dispatch(repeated.state, keyAction('keyup', 300))

    expect(released.shouldOpen).toBe(false)
    expect(released.state).toEqual(DOUBLE_SHIFT_INITIAL_STATE)
  })

  it('resets the sequence when the window loses focus', () => {
    const first = tapShift(DOUBLE_SHIFT_INITIAL_STATE, 100)
    const blurred = dispatch(first.state, { type: 'reset' })
    const afterBlur = tapShift(blurred.state, 200)

    expect(afterBlur.shouldOpen).toBe(false)
    expect(afterBlur.state.firstTapAt).toBe(220)
  })
})
