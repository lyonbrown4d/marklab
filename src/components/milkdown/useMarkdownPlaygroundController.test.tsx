import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkdownPlaygroundController } from '@/components/milkdown/useMarkdownPlaygroundController'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'

type MarkdownUpdatedListener = (ctx: unknown, markdown: string) => void

const codeBlockTheme = vi.hoisted(() => ({ extension: [], setDarkMode: vi.fn() }))
vi.mock('@/components/milkdown/markdownCodeBlockTheme', () => ({
  createMarkdownCodeBlockTheme: () => codeBlockTheme,
}))

const crepeMock = vi.hoisted(() => {
  const instances: FakeCrepe[] = []
  let latestMarkdownUpdated: MarkdownUpdatedListener | null = null

  class FakeCrepe {
    static Feature = {
      BlockEdit: 'BlockEdit',
      CodeMirror: 'CodeMirror',
      LinkTooltip: 'LinkTooltip',
      Placeholder: 'Placeholder',
    } as const

    readonly editor = {
      action: vi.fn((action: unknown) => {
        if (typeof action === 'function') {
          const view = {
            state: {
              doc: { content: { size: this.markdown.length + 2 } },
              selection: { from: 0 },
              tr: {
                doc: { resolve: vi.fn((position: number) => position) },
                replace: vi.fn(() => view.state.tr),
                setSelection: vi.fn(() => view.state.tr),
              },
            },
            dispatch: vi.fn(),
          }
          return action({
            get: (key: unknown) => {
              if (String(key).includes('parserCtx')) {
                return (markdown: string) => {
                  this.markdown = serializeMarkdown(markdown)
                  return { content: { size: this.markdown.length + 2 } }
                }
              }
              return view
            },
          })
        }
        return this.markdown
      }),
      config: vi.fn((configure: (ctx: { get: () => unknown }) => void) => {
        configure({
          get: () => ({
            markdownUpdated: (listener: MarkdownUpdatedListener) => {
              latestMarkdownUpdated = listener
            },
          }),
        })
        return this.editor
      }),
      use: vi.fn(() => this.editor),
    }
    markdown: string
    readonly destroy = vi.fn()

    constructor(options: { defaultValue: string }) {
      this.markdown = serializeMarkdown(options.defaultValue)
      instances.push(this)
    }

    create = vi.fn(async () => undefined)
    getMarkdown = vi.fn(() => this.markdown)
  }

  const serializeMarkdown = (markdown: string) =>
    markdown.replace(/^- /gm, '* ').replace(/\n(?=\* )/g, '\n\n')

  return {
    FakeCrepe,
    latestInstance: () => instances.at(-1) ?? null,
    latestMarkdownUpdated: () => latestMarkdownUpdated,
    reset: () => {
      instances.length = 0
      latestMarkdownUpdated = null
    },
  }
})

vi.mock('@milkdown/crepe', () => ({
  Crepe: crepeMock.FakeCrepe,
}))

vi.mock('@milkdown/kit/core', () => ({
  editorViewCtx: Symbol('editorViewCtx'),
  parserCtx: Symbol('parserCtx'),
}))

vi.mock('@milkdown/kit/plugin/listener', () => ({
  listener: {},
  listenerCtx: Symbol('listenerCtx'),
}))

vi.mock('@milkdown/kit/prose/model', () => ({
  Slice: vi.fn(),
}))

vi.mock('@milkdown/kit/prose/state', () => ({
  Selection: {
    near: vi.fn(),
  },
}))

vi.mock('@milkdown/kit/utils', () => ({
  getMarkdown: () => () => crepeMock.latestInstance()?.getMarkdown(),
}))

vi.mock('@uiw/codemirror-theme-eclipse', () => ({
  eclipse: {},
}))

vi.mock('@/components/milkdown/animatedCursorPlugin', () => ({
  animatedCursor: {},
}))

vi.mock('@/components/milkdown/markdownSafePlugins', () => ({
  createMarkdownSafePlugins: () => [],
}))

vi.mock('@/components/milkdown/mermaidPreview', () => ({
  mermaidCodeBlockConfig: {},
  refreshMermaidPreviews: vi.fn(),
}))

vi.mock('@/components/milkdown/slashMenuConfig', () => ({
  createMarkdownPlaygroundSlashConfig: () => ({}),
}))

vi.mock('@/components/milkdown/typewriterScrollPlugin', () => ({
  typewriterScroll: {},
}))

const slashLabels = {} as SlashCommandLabels

const Harness = ({
  activePath = 'docs/example.md',
  darkMode = false,
  placeholder = 'Write',
  onChange,
  value,
}: {
  activePath?: string
  darkMode?: boolean
  placeholder?: string
  onChange: (markdown: string) => void
  value: string
}) => {
  const controller = useMarkdownPlaygroundController({
    activePath,
    darkMode,
    onChange,
    placeholder,
    slashLabels,
    value,
  })

  // eslint-disable-next-line react-hooks/refs -- Test harness mirrors the production ref mount.
  return <div ref={controller.rootRef} />
}

const renderReadyHarness = async (onChange: (markdown: string) => void, value: string) => {
  render(<Harness onChange={onChange} value={value} />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(crepeMock.latestInstance()).toBeTruthy()
  return crepeMock.latestMarkdownUpdated()
}

describe('useMarkdownPlaygroundController', () => {
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
