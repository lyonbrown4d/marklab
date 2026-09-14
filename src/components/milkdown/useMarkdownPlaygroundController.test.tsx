import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  codeBlockTheme,
  crepeMock,
  Harness,
  renderReadyHarness,
  shortcutBridgeMock,
} from '@/components/milkdown/markdownPlaygroundControllerTestHarness'

describe('useMarkdownPlaygroundController', () => {
  it('installs the shortcut bridge on the actual playground instance with user bindings', async () => {
    const overrides = { 'editor.clearFormat': ['Control+Shift+X'] }
    const { rerender } = render(
      <Harness value="A" onChange={vi.fn()} shortcutOverrides={overrides} />,
    )
    await act(async () => {})
    const original = crepeMock.latestInstance()
    const hook = shortcutBridgeMock
    const options = hook.mock.calls.at(-1)?.[0]
    expect(options?.enabled).toBe(true)
    expect(options?.crepeRef.current).toBe(original)
    expect(options?.overrides).toBe(overrides)
    expect(options?.onUrlInsert).toBeTypeOf('function')
    expect(original?.editor.use).toHaveBeenCalledWith(hook.mock.results.at(-1)?.value)
    rerender(
      <Harness value="A" onChange={vi.fn()} shortcutOverrides={{ 'editor.clearFormat': [] }} />,
    )
    await act(async () => {})
    expect(hook.mock.calls.at(-1)?.[0].overrides).toEqual({ 'editor.clearFormat': [] })
    expect(crepeMock.latestInstance()).toBe(original)
  })

  it('waits for the old editor to finish destroying before starting its replacement', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<Harness onChange={onChange} value="A" />)
    await act(async () => {})
    const previous = crepeMock.latestInstance()
    let finishDestroy = () => {}
    previous?.destroy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDestroy = resolve
        }),
    )
    rerender(<Harness onChange={onChange} value="A" placeholder="Continue" />)
    const replacement = crepeMock.latestInstance()
    await act(async () => {})
    expect(previous?.destroy).toHaveBeenCalledOnce()
    expect(replacement?.create).not.toHaveBeenCalled()
    await act(async () => {
      finishDestroy()
    })
    expect(replacement?.create).toHaveBeenCalledOnce()
  })

  it('does not start a superseded editor while another instance is being destroyed', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<Harness onChange={onChange} value="A" />)
    await act(async () => {})
    let finishDestroy = () => {}
    crepeMock.latestInstance()?.destroy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDestroy = resolve
        }),
    )
    rerender(<Harness onChange={onChange} value="A" placeholder="Continue" />)
    const superseded = crepeMock.latestInstance()
    rerender(<Harness onChange={onChange} value="B" />)
    const current = crepeMock.latestInstance()
    await act(async () => {
      finishDestroy()
    })
    expect(superseded?.create).not.toHaveBeenCalled()
    expect(current?.create).toHaveBeenCalledOnce()
    expect(current?.getMarkdown()).toBe('B')
    expect(onChange).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    vi.useFakeTimers()
    crepeMock.reset()
    codeBlockTheme.setDarkMode.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('changes code block appearance without recreating the document editor', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<Harness onChange={onChange} value="A" />)
    await act(async () => {})
    const original = crepeMock.latestInstance()
    rerender(<Harness onChange={onChange} value="A" darkMode />)
    expect(codeBlockTheme.setDarkMode).toHaveBeenLastCalledWith(true)
    rerender(<Harness onChange={onChange} value="A" />)
    expect(codeBlockTheme.setDarkMode).toHaveBeenLastCalledWith(false)
    await act(async () => {})
    expect(crepeMock.latestInstance()).toBe(original)
    expect(original?.destroy).not.toHaveBeenCalled()
    expect(original?.create).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not save markdown that only changed because Crepe serialized the initial document', async () => {
    const onChange = vi.fn()
    const listener = await renderReadyHarness(onChange, '- A\n- B')

    await act(async () => {
      listener?.({}, '* A\n\n* B')
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('still emits user markdown edits after the initial serialized baseline is synced', async () => {
    const onChange = vi.fn()
    const listener = await renderReadyHarness(onChange, '- A\n- B')

    await act(async () => {
      listener?.({}, '* A\n\n* B\n\nNew line')
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(onChange).toHaveBeenCalledWith('* A\n\n* B\n\nNew line')
  })

  it('does not save markdown that only changed because a replacement document was serialized', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <Harness activePath="docs/first.md" onChange={onChange} value="- A\n- B" />,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const listener = crepeMock.latestMarkdownUpdated()

    await act(async () => {
      rerender(<Harness activePath="docs/second.md" onChange={onChange} value="- C\n- D" />)
      await Promise.resolve()
    })

    const serializedReplacement = crepeMock.latestInstance()?.getMarkdown() ?? ''

    await act(async () => {
      listener?.({}, serializedReplacement)
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(onChange).not.toHaveBeenCalled()
  })
})
