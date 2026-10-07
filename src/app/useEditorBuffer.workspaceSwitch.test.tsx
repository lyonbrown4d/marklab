import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBuffer } from '@/app/useEditorBuffer'

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  flushBuffers: vi.fn(),
}))

vi.mock('@/app/editorBufferSync', () => ({
  createEditorBufferSync: () => ({ clear: mocks.clear, enqueue: vi.fn() }),
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: vi.fn(() => vi.fn()) },
}))
vi.mock('@/services/fsApi', () => ({
  fsApi: {
    applyBufferUpdate: vi.fn(),
    flushBuffers: mocks.flushBuffers,
    getBufferStatus: vi.fn(),
    openFile: vi.fn(),
  },
}))
vi.mock('react-router-dom', () => ({ useLocation: () => ({ state: null }) }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('useEditorBuffer workspace switching', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clears acknowledged document snapshots only after a successful flush', async () => {
    let finishFlush: (() => void) | undefined
    mocks.flushBuffers.mockReturnValue(
      new Promise<number>((resolve) => {
        finishFlush = () => resolve(0)
      }),
    )
    const { rerender } = renderHook(
      ({ workspaceKey }) => useEditorBuffer({ activePath: null, workspaceKey }),
      { initialProps: { workspaceKey: 'first' } },
    )

    rerender({ workspaceKey: 'second' })
    await waitFor(() => expect(mocks.flushBuffers).toHaveBeenCalledOnce())
    expect(mocks.clear).not.toHaveBeenCalled()
    finishFlush?.()
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce())
  })
})
