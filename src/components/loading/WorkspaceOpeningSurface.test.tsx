import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceOpeningSurface } from '@/components/loading/WorkspaceOpeningSurface'
import type { WindowOpeningProgress } from '@/types/windowOpening'

const bridge = vi.hoisted(() => ({ retry: vi.fn(), onProgress: vi.fn(), unlisten: vi.fn() }))
vi.mock('@/runtime/desktop', () => ({
  isDesktopRuntime: () => true,
  getDesktopRuntime: () => ({ opening: bridge }),
}))

describe('shared workspace opening surface', () => {
  let progress: (value: WindowOpeningProgress) => void
  beforeEach(() => {
    vi.clearAllMocks()
    bridge.retry.mockResolvedValue({ ok: true })
    bridge.onProgress.mockImplementation((listener) => {
      progress = listener
      return bridge.unlisten
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('localizes the fallback failure when retry has no error message', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN')
    bridge.retry.mockResolvedValue({ ok: false })
    render(<WorkspaceOpeningSurface />)
    act(() => progress({ stage: 'failed', workspacePath: '/notes' }))
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('工作区打开失败'))
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled()
  })

  it('shows an actionable fallback for non-Error retry failures', async () => {
    bridge.retry.mockRejectedValue(null)
    render(<WorkspaceOpeningSurface />)
    act(() => progress({ stage: 'failed', workspacePath: '/notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Workspace failed to open'),
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })

  it('keeps the pending surface until a successful retry reports new progress', async () => {
    render(<WorkspaceOpeningSurface />)
    act(() => progress({ stage: 'failed', workspacePath: '/notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(bridge.retry).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => progress({ stage: 'loading', workspacePath: '/notes' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading workspace…')
  })

  it('uses the shared motion, replays typed progress and stops motion on failure', () => {
    const view = render(<WorkspaceOpeningSurface />)
    expect(screen.getByRole('status')).toHaveTextContent('Starting window…')
    expect(document.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    act(() => progress({ stage: 'indexing', workspacePath: '/notes' }))
    expect(screen.getByRole('status')).toHaveTextContent('Preparing index…')
    expect(screen.getByText('/notes')).toHaveAttribute('title', '/notes')
    act(() => progress({ stage: 'failed', workspacePath: '/notes', error: 'Disk unavailable' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Disk unavailable')
    expect(document.querySelector('[data-document-loading]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    view.unmount()
    expect(bridge.unlisten).toHaveBeenCalledOnce()
  })

  it('retains a failed retry response and allows retrying again', async () => {
    bridge.retry.mockResolvedValue({ ok: false, error: 'Path missing' })
    render(<WorkspaceOpeningSurface />)
    act(() => progress({ stage: 'failed', workspacePath: '/notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Path missing'))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })

  it('handles a rejected retry and restores document motion on subsequent progress', async () => {
    bridge.retry.mockRejectedValue(new Error('Retry unavailable'))
    render(<WorkspaceOpeningSurface />)
    act(() => progress({ stage: 'failed', workspacePath: '/notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Retry unavailable'))
    act(() => progress({ stage: 'loading', workspacePath: '/notes' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Loading workspace…')
    expect(document.querySelectorAll('[data-splash-line]')).toHaveLength(3)
  })

  it('does not continue updating an opening surface after retry navigation unmounts it', async () => {
    let finish!: (value: { ok: boolean }) => void
    bridge.retry.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<WorkspaceOpeningSurface />)
    act(() => progress({ stage: 'failed', workspacePath: '/notes' }))
    const retryButton = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(retryButton)
    expect(retryButton).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Starting window…')
    view.unmount()
    await act(async () => finish({ ok: true }))
    expect(bridge.unlisten).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-document-loading]')).toBeNull()
  })
})
