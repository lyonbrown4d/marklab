import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkdownPlaygroundController } from '@/components/milkdown/useMarkdownPlaygroundController'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'

type MarkdownUpdatedListener = (ctx: unknown, markdown: string) => void

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
  onChange,
  value,
}: {
  activePath?: string
  onChange: (markdown: string) => void
  value: string
}) => {
  const controller = useMarkdownPlaygroundController({
    activePath,
    darkMode: false,
    onChange,
    placeholder: 'Write',
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
  beforeEach(() => {
    vi.useFakeTimers()
    crepeMock.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
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
