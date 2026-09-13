import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkdownCrepeLifecycle } from '@/components/milkdown/useMarkdownCrepeLifecycle'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
  getMarkdown: vi.fn(),
  configure: vi.fn(),
  makeCrepe: vi.fn(),
  load: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('@/components/milkdown/markdownCrepeScheduling', () => ({
  scheduleMarkdownEditorCreate: mocks.schedule,
}))
vi.mock('@/components/milkdown/markdownCrepeRuntime', () => ({
  loadMarkdownCrepeRuntime: mocks.load,
}))
vi.mock('@/components/milkdown/editorActions', () => ({
  normalizeMarkdownLineBreaks: (value: string) => value.replace(/\r\n/g, '\n'),
  readCrepeMarkdown: (_crepe: unknown, fallback: string) => fallback,
}))

type Options = Parameters<typeof useMarkdownCrepeLifecycle>[0]
const createOptions = (): Options => ({
  rootRef: { current: document.createElement('div') },
  crepeRef: { current: null },
  latestValue: { current: '# Initial' },
  activePathRef: { current: 'a.md' },
  onChangeRef: { current: vi.fn() },
  localEchoRef: { current: null },
  applyingExternalValueRef: { current: false },
  lastSyncedPathRef: { current: 'a.md' },
  scheduledExternalApplyRef: { current: 0 },
  setStatus: vi.fn(),
  darkMode: false,
  placeholder: 'Write',
  slashLabels: {
    textGroup: '',
    listGroup: '',
    advancedGroup: '',
    text: '',
    heading1: '',
    heading2: '',
    heading3: '',
    heading4: '',
    heading5: '',
    heading6: '',
    quote: '',
    divider: '',
    link: '',
    linkUrlPrompt: '',
    linkTextPrompt: '',
    bold: '',
    italic: '',
    inlineCode: '',
    strike: '',
    clearFormat: '',
    bulletList: '',
    orderedList: '',
    taskList: '',
    image: '',
    imageUrl: '',
    imageUrlPrompt: '',
    imageAltPrompt: '',
    codeBlock: '',
    codeTypeScript: '',
    codeJavaScript: '',
    codeJson: '',
    codeBash: '',
    codeHtml: '',
    mermaid: '',
    table: '',
    footnote: '',
    frontmatter: '',
    details: '',
    toc: '',
    calloutNote: '',
    calloutTip: '',
    calloutImportant: '',
    calloutWarning: '',
    calloutCaution: '',
    calendarFile: '',
    calendarFilePrompt: '',
  },
  nodeViewFactory: vi.fn(),
  getImageDocumentPath: () => 'a.md',
  subscribeImageDocumentPath: () => () => {},
  resolveImageSrc: async (_path, src) => src,
  pickAndImportImage: async () => false,
  createCalendarFileLink: async () => null,
  applyExternalValue: vi.fn(),
  scrollEditorToTop: vi.fn(),
  focusEditor: vi.fn(),
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.schedule.mockReturnValue(mocks.cancel)
  mocks.create.mockResolvedValue(undefined)
  mocks.destroy.mockResolvedValue(undefined)
  mocks.getMarkdown.mockReturnValue('# Initial')
  mocks.makeCrepe.mockReturnValue({
    create: mocks.create,
    destroy: mocks.destroy,
    getMarkdown: mocks.getMarkdown,
  })
  mocks.load.mockResolvedValue({
    createMarkdownCrepe: mocks.makeCrepe,
    configureMarkdownCrepe: mocks.configure,
  })
})

afterEach(() => vi.restoreAllMocks())

const createScheduledEditor = async (index = 0) => {
  await act(async () => {
    const task = mocks.schedule.mock.calls[index]?.[1]
    if (typeof task !== 'function') throw new Error('Creation was not scheduled')
    task()
  })
}

describe('Crepe lifecycle extraction', () => {
  it('waits for asynchronous teardown before creating a replacement', async () => {
    let resolveDestroy = () => {}
    mocks.destroy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDestroy = resolve
        }),
    )
    const options = createOptions()
    const { rerender } = renderHook((props: Options) => useMarkdownCrepeLifecycle(props), {
      initialProps: options,
    })
    await createScheduledEditor()
    rerender({ ...options, darkMode: true })
    await createScheduledEditor(1)
    expect(mocks.destroy).toHaveBeenCalledOnce()
    expect(mocks.makeCrepe).toHaveBeenCalledOnce()
    await act(async () => {
      resolveDestroy()
    })
    expect(mocks.makeCrepe).toHaveBeenCalledTimes(2)
    expect(options.crepeRef.current).not.toBeNull()
  })

  it('preserves the latest document when the initial creation finishes late', async () => {
    let resolveCreate = () => {}
    mocks.create.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve
        }),
    )
    const options = createOptions()
    renderHook(() => useMarkdownCrepeLifecycle(options))
    await createScheduledEditor()
    options.activePathRef.current = 'b.md'
    options.latestValue.current = '# New document'
    await act(async () => {
      resolveCreate()
    })
    expect(options.latestValue.current).toBe('# New document')
    expect(options.applyExternalValue).toHaveBeenCalledWith(
      options.crepeRef.current,
      '# New document',
      { preserveSelection: false },
    )
    expect(options.lastSyncedPathRef.current).toBe('b.md')
    expect(options.onChangeRef.current).not.toHaveBeenCalled()
  })

  it('ignores updates emitted by a disposed editor', async () => {
    const options = createOptions()
    const { unmount } = renderHook(() => useMarkdownCrepeLifecycle(options))
    await createScheduledEditor()
    const update = mocks.configure.mock.calls[0]?.[1].onMarkdownUpdated
    unmount()
    update('# Stale content')
    expect(options.latestValue.current).toBe('# Initial')
    expect(options.onChangeRef.current).not.toHaveBeenCalled()
    expect(options.localEchoRef.current).toBeNull()
  })

  it('handles an asynchronous destroy failure without blocking the next editor', async () => {
    const error = new Error('Teardown failed')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.destroy.mockRejectedValueOnce(error)
    const options = createOptions()
    const { rerender } = renderHook((props: Options) => useMarkdownCrepeLifecycle(props), {
      initialProps: options,
    })
    await createScheduledEditor()
    rerender({ ...options, darkMode: true })
    await createScheduledEditor(1)
    expect(report).toHaveBeenCalledWith('Failed to destroy Milkdown', error)
    expect(mocks.makeCrepe).toHaveBeenCalledTimes(2)
    expect(options.setStatus).toHaveBeenLastCalledWith({ phase: 'ready' })
  })

  it('keeps the editor on stable rerenders and destroys it on unmount', async () => {
    const options = createOptions()
    const { rerender, unmount } = renderHook(() => useMarkdownCrepeLifecycle(options))
    await createScheduledEditor()
    expect(options.setStatus).toHaveBeenCalledWith({ phase: 'ready' })
    expect(options.crepeRef.current).not.toBeNull()
    rerender()
    expect(mocks.makeCrepe).toHaveBeenCalledOnce()
    expect(mocks.destroy).not.toHaveBeenCalled()
    unmount()
    expect(mocks.cancel).toHaveBeenCalledOnce()
    expect(mocks.destroy).toHaveBeenCalledOnce()
    expect(options.crepeRef.current).toBeNull()
    expect(options.scheduledExternalApplyRef.current).toBe(1)
  })
  it('ignores a queued creation after unmount', async () => {
    const options = createOptions()
    const { unmount } = renderHook(() => useMarkdownCrepeLifecycle(options))
    unmount()
    await createScheduledEditor()
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.cancel).toHaveBeenCalledOnce()
  })
  it('destroys an initializing instance without publishing ready after teardown', async () => {
    let resolveCreate = () => {}
    mocks.create.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve
        }),
    )
    const options = createOptions()
    const { unmount } = renderHook(() => useMarkdownCrepeLifecycle(options))
    await createScheduledEditor()
    unmount()
    await act(async () => {
      resolveCreate()
    })
    expect(mocks.destroy).toHaveBeenCalledOnce()
    expect(options.setStatus).not.toHaveBeenCalledWith({ phase: 'ready' })
    expect(options.crepeRef.current).toBeNull()
  })
})
