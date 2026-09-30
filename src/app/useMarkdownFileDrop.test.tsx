import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeWebviewDropEvent } from '@/runtime/webview'
import { useMarkdownFileDrop } from '@/app/useMarkdownFileDrop'

let dropHandler: ((event: RuntimeWebviewDropEvent) => void) | null = null
const unsubscribe = vi.fn()

vi.mock('@/runtime/webview', () => ({
  onRuntimeWebviewFileDrop: vi.fn(async (handler: (event: RuntimeWebviewDropEvent) => void) => {
    dropHandler = handler
    return unsubscribe
  }),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === 'projectLoader.multipleMarkdownFilesDropped'
        ? `Opened the first Markdown file; ignored ${options?.count ?? 0} more.`
        : key,
  }),
}))

const drop = (paths: string[]) => {
  act(() => {
    dropHandler?.({ paths, position: { x: 0, y: 0 } })
  })
}

describe('useMarkdownFileDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dropHandler = null
  })

  it('opens the first dropped Markdown file in the current window', async () => {
    const openPath = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useMarkdownFileDrop(openPath))
    await waitFor(() => expect(dropHandler).not.toBeNull())

    drop(['C:\\notes\\README.MD'])

    expect(openPath).toHaveBeenCalledOnce()
    expect(openPath).toHaveBeenCalledWith('C:\\notes\\README.MD')
  })

  it('ignores non-Markdown paths so image drops remain editor-owned', async () => {
    const openPath = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useMarkdownFileDrop(openPath))
    await waitFor(() => expect(dropHandler).not.toBeNull())

    drop(['C:\\notes\\cover.png', 'C:\\notes\\draft.txt'])

    expect(openPath).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('opens only the first Markdown file and reports the ignored remainder', async () => {
    const openPath = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useMarkdownFileDrop(openPath))
    await waitFor(() => expect(dropHandler).not.toBeNull())

    drop(['C:\\notes\\one.md', 'C:\\notes\\two.markdown'])

    expect(openPath).toHaveBeenCalledOnce()
    expect(openPath).toHaveBeenCalledWith('C:\\notes\\one.md')
    expect(toast.info).toHaveBeenCalledWith('Opened the first Markdown file; ignored 1 more.')
  })

  it('unsubscribes from the preload bridge on unmount', async () => {
    const { unmount } = renderHook(() => useMarkdownFileDrop(vi.fn()))
    await waitFor(() => expect(dropHandler).not.toBeNull())

    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
