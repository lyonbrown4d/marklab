import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  codeBlockTheme,
  crepeMock,
  Harness,
  inlineCompletionPluginMock,
  renderReadyHarness,
  shortcutBridgeMock,
} from '@/components/milkdown/markdownPlaygroundControllerTestHarness'
import { useDocumentStats } from '@/pages/useDocumentStats'

const EditorStatsHarness = () => {
  const [value, setValue] = useState('')
  const stats = useDocumentStats(value)
  return (
    <>
      <Harness onChange={setValue} value={value} />
      <output data-testid="stats">
        {stats.lines}:{stats.words}:{stats.characters}
      </output>
    </>
  )
}

describe('useMarkdownPlaygroundController', () => {
  it('registers inline completion before safe table plugins', async () => {
    const options = {
      canComplete: () => true,
      enabled: () => true,
      requestCompletion: vi.fn(async () => null),
    }
    render(<Harness inlineCompletionOptions={options} onChange={vi.fn()} value="A" />)
    await act(async () => {})

    const calls = crepeMock.latestInstance()?.editor.use.mock.calls ?? []
    expect(inlineCompletionPluginMock).toHaveBeenCalledWith(options)
    expect(calls.findIndex(([plugin]) => plugin === 'inline-completion-plugin')).toBeLessThan(
      calls.findIndex(([plugin]) => plugin === 'safe-plugin'),
    )
  })

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

  it('configures ProseMirror as non-editable and disables editor shortcuts when read-only', async () => {
    render(<Harness value="A" onChange={vi.fn()} readOnly />)
    await act(async () => {})

    const editable = crepeMock.editorViewOptions().editable as (() => boolean) | undefined
    expect(editable?.()).toBe(false)
    expect(shortcutBridgeMock.mock.calls.at(-1)?.[0].enabled).toBe(false)
  })

  it('disables browser spellcheck for line-dense large documents', async () => {
    render(<Harness value={'x\n'.repeat(2_000)} onChange={vi.fn()} />)
    await act(async () => {})

    expect(crepeMock.editorViewOptions().attributes).toMatchObject({ spellcheck: 'false' })
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
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('still emits user markdown edits after the initial serialized baseline is synced', async () => {
    const onChange = vi.fn()
    const listener = await renderReadyHarness(onChange, '- A\n- B')

    await act(async () => {
      listener?.({}, '* A\n\n* B\n\nNew line')
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(onChange).toHaveBeenCalledWith('* A\n\n* B\n\nNew line')
  })

  it('defers full markdown serialization until the renderer is idle', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} value="A" />)
    await act(async () => {})
    const listener = crepeMock.latestDocumentChange()

    expect(listener).toBeTypeOf('function')
    expect(crepeMock.latestMarkdownUpdated()).toBeNull()
    act(() => listener?.({ markdown: 'B' }))
    expect(crepeMock.serializer).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(279)
    })
    expect(crepeMock.serializer).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(201)
    })

    expect(crepeMock.serializer).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('B')
  })

  it('updates document statistics after a pasted document snapshot is committed', async () => {
    render(<EditorStatsHarness />)
    await act(async () => {})
    const listener = crepeMock.latestDocumentChange()

    act(() => listener?.({ markdown: 'one two\nthree' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.getByTestId('stats')).toHaveTextContent('2:3:11')
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

    const listener = crepeMock.latestDocumentChange()

    await act(async () => {
      rerender(<Harness activePath="docs/second.md" onChange={onChange} value="- C\n- D" />)
      await Promise.resolve()
    })

    const serializedReplacement = crepeMock.latestInstance()?.getMarkdown() ?? ''

    await act(async () => {
      listener?.({ markdown: serializedReplacement })
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not replace an active IME composition with a controlled value update', async () => {
    const onChange = vi.fn()
    const { container, rerender } = render(
      <Harness activePath="docs/first.md" onChange={onChange} value="Before" />,
    )
    await act(async () => {})
    const root = container.firstElementChild as HTMLElement
    const crepe = crepeMock.latestInstance()!

    act(() => root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    act(() => root.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true })))
    crepe.markdown = '正在输入'
    rerender(<Harness activePath="docs/first.md" onChange={onChange} value="Remote update" />)

    expect(crepe.getMarkdown()).toBe('正在输入')

    await act(async () => {
      root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      await Promise.resolve()
    })

    expect(crepe.getMarkdown()).toBe('正在输入')
  })

  it('does not serialize or synchronously flush the document at IME boundaries', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <Harness activePath="docs/first.md" onChange={onChange} value="Before" />,
    )
    await act(async () => {})
    const root = container.firstElementChild as HTMLElement
    const crepe = crepeMock.latestInstance()!
    crepe.getMarkdown.mockClear()
    crepeMock.serializer.mockClear()

    await act(async () => {
      root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      root.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true }))
      root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      await Promise.resolve()
    })

    expect(crepe.getMarkdown).not.toHaveBeenCalled()
    expect(crepeMock.serializer).not.toHaveBeenCalled()
  })
})
