import { describe, expect, it } from 'vitest'

import { isImeKeyboardEvent } from '@/logic/ime'

describe('isImeKeyboardEvent', () => {
  it('recognizes native composition state and the IME Process key', () => {
    expect(isImeKeyboardEvent({ isComposing: true, key: 'Enter' })).toBe(true)
    expect(isImeKeyboardEvent({ isComposing: false, key: 'Process' })).toBe(true)
  })

  it('does not suppress ordinary keyboard input', () => {
    expect(isImeKeyboardEvent({ isComposing: false, key: 'Enter' })).toBe(false)
  })
})
