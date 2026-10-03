import { describe, expect, it } from 'vitest'
import { resolvePlateCodeCompletionKey } from '@/components/plate/code/plateCodeCompletionKeys'

describe('resolvePlateCodeCompletionKey', () => {
  it('ignores every key while IME composition is active', () => {
    expect(
      resolvePlateCodeCompletionKey({ key: 'Enter', composing: true, menuOpen: true, ctrl: false }),
    ).toBe('none')
    expect(
      resolvePlateCodeCompletionKey({
        key: 'Enter',
        composing: false,
        keyCode: 229,
        menuOpen: true,
        ctrl: false,
      }),
    ).toBe('none')
  })

  it('maps completion navigation and explicit trigger keys', () => {
    expect(
      resolvePlateCodeCompletionKey({
        key: 'ArrowDown',
        composing: false,
        menuOpen: true,
        ctrl: false,
      }),
    ).toBe('next')
    expect(
      resolvePlateCodeCompletionKey({ key: 'Tab', composing: false, menuOpen: true, ctrl: false }),
    ).toBe('accept')
    expect(
      resolvePlateCodeCompletionKey({ key: ' ', composing: false, menuOpen: false, ctrl: true }),
    ).toBe('complete')
  })
})
