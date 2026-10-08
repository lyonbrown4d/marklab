import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RendererBootstrap from '@/app/RendererBootstrap'
import { acceptWorkspaceSessionSeed, notifyRendererInteractive } from '@/runtime/rendererLifecycle'
import type { WindowOpeningProgress } from '@/types/windowOpening'

const runtime = vi.hoisted(() => ({
  appReady: vi.fn(async () => ({ ok: true })),
  onProgress: vi.fn(),
  retry: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => ({
    appReady: runtime.appReady,
    opening: {
      onProgress: runtime.onProgress,
      retry: runtime.retry,
    },
  }),
  isElectronRuntime: () => true,
}))

describe('RendererBootstrap', () => {
  let onProgress: ((progress: WindowOpeningProgress) => void) | null

  beforeEach(() => {
    onProgress = null
    window.history.replaceState({}, '', '/?marklab-standby=1')
    runtime.appReady.mockResolvedValue({ ok: true })
    runtime.retry.mockResolvedValue({ ok: true })
    runtime.onProgress.mockImplementation((handler) => {
      onProgress = handler
      return () => undefined
    })
  })

  it('keeps workspace code unmounted and the loading surface visible until interactive', async () => {
    render(<RendererBootstrap application={<div>Workspace application</div>} />)

    expect(screen.getAllByText('Starting window…')).not.toHaveLength(0)
    expect(screen.queryByText('Workspace application')).not.toBeInTheDocument()

    act(() => {
      onProgress?.({
        error: 'renderer hydration failed',
        stage: 'failed',
        workspacePath: 'C:\\notes',
      })
    })
    expect(screen.getByText('renderer hydration failed')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()

    act(() => {
      acceptWorkspaceSessionSeed({ state: { rootPath: 'C:\\notes' }, version: 1 })
    })
    await waitFor(() => expect(screen.getByText('Workspace application')).toBeVisible())
    expect(screen.getByText('renderer hydration failed')).toBeVisible()

    act(() => notifyRendererInteractive())
    await waitFor(() =>
      expect(screen.queryByText('renderer hydration failed')).not.toBeInTheDocument(),
    )
  })

  it('reenables retry and shows the error when retry IPC rejects', async () => {
    runtime.retry.mockRejectedValue(new Error('retry channel unavailable'))
    render(<RendererBootstrap application={<div>Workspace application</div>} />)

    act(() => {
      onProgress?.({ error: 'first failure', stage: 'failed', workspacePath: 'C:\\notes' })
    })
    const retry = screen.getByRole('button', { name: 'Retry' })
    retry.click()

    await waitFor(() => expect(screen.getByText('retry channel unavailable')).toBeVisible())
    expect(retry).toBeEnabled()
  })
})
