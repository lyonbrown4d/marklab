import { act, renderHook } from '@testing-library/react'
import type { PlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlateMarkdownDiagnostics } from '@/components/plate/usePlateMarkdownDiagnostics'

const session = vi.hoisted(() => ({
  analyze: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
  publish: undefined as ((content: string, diagnostics: []) => void) | undefined,
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/components/plate/plateMarkdownDiagnosticsSession', () => ({
  createPlateMarkdownDiagnosticsSession: (options: { onDiagnostics: typeof session.publish }) => {
    session.create()
    session.publish = options.onDiagnostics
    return session
  },
}))

const setup = (value: string) => {
  const redecorate = vi.fn()
  const editor = { api: { redecorate } } as unknown as PlateEditor
  const getMarkdown = vi.fn().mockResolvedValue('Clean text')
  const hook = renderHook(
    ({ content }) =>
      usePlateMarkdownDiagnostics({
        activePath: 'note.md',
        editor,
        enabled: true,
        getMarkdown,
        readOnly: false,
        value: content,
      }),
    { initialProps: { content: value } },
  )
  return { ...hook, getMarkdown, redecorate }
}

describe('Plate diagnostic work scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    session.analyze.mockResolvedValue(undefined)
    session.close.mockResolvedValue(undefined)
  })
  afterEach(() => vi.useRealTimers())

  it('skips serialization and LSP for a disabled large document, then resumes after it shrinks', async () => {
    const hook = setup('x'.repeat(500_001))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    expect(hook.getMarkdown).not.toHaveBeenCalled()
    expect(session.create).not.toHaveBeenCalled()
    hook.rerender({ content: 'Clean text' })
    await act(async () => vi.advanceTimersByTimeAsync(150))
    expect(session.create).toHaveBeenCalledOnce()
    expect(session.analyze).toHaveBeenCalledWith('Clean text')
    hook.unmount()
    expect(session.close).toHaveBeenCalledOnce()
  })

  it('does not redecorate every block when another clean snapshot or value arrives', async () => {
    const hook = setup('Clean text')
    const initial = hook.redecorate.mock.calls.length
    act(() => session.publish?.('Clean text', []))
    hook.rerender({ content: 'Another clean text' })
    await act(async () => vi.advanceTimersByTimeAsync(150))
    expect(session.analyze).toHaveBeenCalled()
    expect(hook.redecorate).toHaveBeenCalledTimes(initial)
    hook.unmount()
  })
})
