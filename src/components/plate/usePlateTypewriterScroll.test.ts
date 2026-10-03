import { describe, expect, it } from 'vitest'
import { computeTypewriterScrollTop } from '@/components/plate/usePlateTypewriterScroll'

describe('computeTypewriterScrollTop', () => {
  it('centers the caret in the reading band and clamps the viewport', () => {
    expect(
      computeTypewriterScrollTop({
        caretTop: 700,
        clientHeight: 500,
        currentScrollTop: 100,
        maxScrollTop: 1_000,
        viewportTop: 100,
      }),
    ).toBe(480)
    expect(
      computeTypewriterScrollTop({
        caretTop: 2_000,
        clientHeight: 500,
        currentScrollTop: 900,
        maxScrollTop: 1_000,
        viewportTop: 0,
      }),
    ).toBe(1_000)
  })

  it('keeps the current position inside the dead zone', () => {
    expect(
      computeTypewriterScrollTop({
        caretTop: 225,
        clientHeight: 500,
        currentScrollTop: 120,
        maxScrollTop: 1_000,
        viewportTop: 0,
      }),
    ).toBe(120)
  })
})
