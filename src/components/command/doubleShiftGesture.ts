export const DOUBLE_SHIFT_THRESHOLD_MS = 400

export type DoubleShiftGestureState = {
  firstTapAt: number | null
  shiftPressedAt: number | null
}

type DoubleShiftKeyAction = {
  type: 'keydown' | 'keyup'
  key: string
  now: number
  altKey: boolean
  ctrlKey: boolean
  defaultPrevented: boolean
  isComposing: boolean
  metaKey: boolean
  repeat: boolean
}

export type DoubleShiftGestureAction = DoubleShiftKeyAction | { type: 'reset' }

type DoubleShiftGestureResult = {
  state: DoubleShiftGestureState
  shouldOpen: boolean
}

export const DOUBLE_SHIFT_INITIAL_STATE: DoubleShiftGestureState = {
  firstTapAt: null,
  shiftPressedAt: null,
}

const resetGesture = (): DoubleShiftGestureResult => ({
  state: DOUBLE_SHIFT_INITIAL_STATE,
  shouldOpen: false,
})

const isInvalidShiftEvent = (action: DoubleShiftKeyAction) =>
  action.altKey ||
  action.ctrlKey ||
  action.defaultPrevented ||
  action.isComposing ||
  action.metaKey ||
  action.repeat

export const reduceDoubleShiftGesture = (
  state: DoubleShiftGestureState,
  action: DoubleShiftGestureAction,
  thresholdMs = DOUBLE_SHIFT_THRESHOLD_MS,
): DoubleShiftGestureResult => {
  if (action.type === 'reset') return resetGesture()

  if (action.key !== 'Shift') {
    return action.type === 'keydown' ? resetGesture() : { state, shouldOpen: false }
  }
  if (isInvalidShiftEvent(action)) return resetGesture()

  if (action.type === 'keydown') {
    if (state.shiftPressedAt !== null) return resetGesture()
    const firstTapAt =
      state.firstTapAt !== null && action.now - state.firstTapAt <= thresholdMs
        ? state.firstTapAt
        : null
    return {
      state: { firstTapAt, shiftPressedAt: action.now },
      shouldOpen: false,
    }
  }

  if (state.shiftPressedAt === null || action.now - state.shiftPressedAt > thresholdMs) {
    return resetGesture()
  }
  if (
    state.firstTapAt !== null &&
    action.now >= state.firstTapAt &&
    action.now - state.firstTapAt <= thresholdMs
  ) {
    return { state: DOUBLE_SHIFT_INITIAL_STATE, shouldOpen: true }
  }
  return {
    state: { firstTapAt: action.now, shiftPressedAt: null },
    shouldOpen: false,
  }
}
