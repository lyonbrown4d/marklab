import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkspaceWindowActions } from '@/components/titlebar/useWorkspaceWindowActions'
import { appApi } from '@/services/appApi'

vi.mock('sonner', () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}))
vi.mock('@/services/appApi', () => ({
  appApi: {
    openCurrentWorkspaceInNewWindow: vi.fn(),
    selectWorkspaceInNewWindow: vi.fn(),
  },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

beforeEach(() => vi.clearAllMocks())

describe('useWorkspaceWindowActions', () => {
  it('shows pending and success feedback while preventing duplicate opens', async () => {
    let resolve!: (value: { ok: boolean; sharedWorkspaceSession: false }) => void
    vi.mocked(appApi.openCurrentWorkspaceInNewWindow).mockReturnValue(
      new Promise((next) => {
        resolve = next
      }) as never,
    )
    const { result } = renderHook(() => useWorkspaceWindowActions())

    act(() => {
      void result.current.openCurrentWorkspaceInNewWindow()
      void result.current.openCurrentWorkspaceInNewWindow()
    })

    expect(appApi.openCurrentWorkspaceInNewWindow).toHaveBeenCalledOnce()
    expect(result.current.opening).toBe(true)
    expect(toast.loading).toHaveBeenCalledWith('windowOpening.opening', expect.any(Object))
    await act(async () => resolve({ ok: true, sharedWorkspaceSession: false }))
    expect(toast.success).toHaveBeenCalledWith('windowOpening.opened', expect.any(Object))
    expect(result.current.opening).toBe(false)
  })

  it('shows an actionable failure that retries the same operation', async () => {
    vi.mocked(appApi.openCurrentWorkspaceInNewWindow)
      .mockResolvedValueOnce({
        ok: false,
        error: 'disk unavailable',
        sharedWorkspaceSession: false,
      })
      .mockResolvedValueOnce({ ok: true, sharedWorkspaceSession: false })
    const { result } = renderHook(() => useWorkspaceWindowActions())

    await act(result.current.openCurrentWorkspaceInNewWindow)
    const options = vi.mocked(toast.error).mock.calls[0][1]
    expect(options).toMatchObject({ description: 'disk unavailable' })
    const retryAction = options?.action
    if (
      !retryAction ||
      typeof retryAction !== 'object' ||
      !('onClick' in retryAction) ||
      typeof retryAction.onClick !== 'function'
    ) {
      throw new Error('Expected an actionable retry toast')
    }

    await act(async () => Reflect.apply(retryAction.onClick, undefined, [{}]))
    expect(appApi.openCurrentWorkspaceInNewWindow).toHaveBeenCalledTimes(2)
  })

  it('dismisses progress without an error when workspace selection is cancelled', async () => {
    vi.mocked(appApi.selectWorkspaceInNewWindow).mockResolvedValue({
      cancelled: true,
      ok: false,
      sharedWorkspaceSession: false,
    })
    const { result } = renderHook(() => useWorkspaceWindowActions())

    await act(result.current.selectWorkspaceInNewWindow)

    expect(toast.dismiss).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
