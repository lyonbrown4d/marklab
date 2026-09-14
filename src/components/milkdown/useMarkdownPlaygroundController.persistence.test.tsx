import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  codeBlockTheme,
  crepeMock,
  Harness,
} from '@/components/milkdown/markdownPlaygroundControllerTestHarness'

describe('useMarkdownPlaygroundController persistence ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    crepeMock.reset()
    codeBlockTheme.setDarkMode.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(
    [false, true].flatMap((insertBeforeEcho) =>
      [
        {
          scenario: 'continuous typing',
          newer: 'Start here\n\nContinue writing without a dialog.',
        },
        {
          scenario: 'link insertion',
          newer: 'Start here\n\n[Read docs](https://example.com/docs)',
        },
        {
          scenario: 'image insertion',
          newer: 'Start here\n\n![Diagram](https://example.com/image.png)',
        },
      ].map((sample) => ({ ...sample, insertBeforeEcho })),
    ),
  )(
    'persists $scenario when it precedes the older value echo: $insertBeforeEcho',
    async ({ insertBeforeEcho, newer }) => {
      const original = 'Start here'
      const slash = 'Start here\n\n/link'
      const onChange = vi.fn()
      const { rerender } = render(<Harness onChange={onChange} value={original} />)
      await act(async () => {})
      const crepe = crepeMock.latestInstance()!
      const listener = crepeMock.latestMarkdownUpdated()!

      // Milkdown has reported the slash text; the controller has not emitted it yet.
      act(() => {
        crepe.markdown = slash
        listener({}, slash)
      })
      // Model the native insertion while Milkdown's next markdown notification is pending.
      if (insertBeforeEcho) crepe.markdown = newer
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
      expect(onChange).toHaveBeenLastCalledWith(slash)

      // Parent acknowledges the older emitted value without changing document identity.
      rerender(<Harness onChange={onChange} value={slash} />)
      if (!insertBeforeEcho) crepe.markdown = newer
      expect(crepe.getMarkdown()).toBe(newer)

      await act(async () => {
        listener({}, newer)
        await vi.advanceTimersByTimeAsync(200)
      })

      expect(crepeMock.latestInstance()).toBe(crepe)
      expect(crepe.getMarkdown()).toBe(newer)
      expect(onChange).toHaveBeenLastCalledWith(newer)
    },
  )
})
