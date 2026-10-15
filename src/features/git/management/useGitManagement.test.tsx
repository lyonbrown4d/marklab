import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { managementApi, resetManagementMocks } from '@/components/git/managementTestFixtures'
import { useGitManagement } from '@/features/git/management/useGitManagement'

beforeEach(resetManagementMocks)
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useGitManagement', () => {
  it('invalidates all repository state on success without invalidating another workspace', async () => {
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useGitManagement('/repo', true), { wrapper })
    await waitFor(() => expect(result.current.operation.isSuccess).toBe(true))
    const action = vi.fn().mockResolvedValue({})
    await act(async () => expect(await result.current.run(action)).toBe(true))
    for (const key of [
      'git-status',
      'git-remote',
      'git-history',
      'git-branches',
      'git-stashes',
      'git-operation',
      'git-commit-files',
      'git-commit-diff',
      'git-file-diff',
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key, '/repo'] })
    }
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['git-status', '/other'] })
  })

  it('refreshes operation state and status after a conflict failure and handles rejection', async () => {
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useGitManagement('/repo', true), { wrapper })
    await waitFor(() => expect(result.current.operation.isSuccess).toBe(true))
    managementApi.getOperationState.mockResolvedValue({ operation: 'merge' })
    await act(async () =>
      expect(await result.current.run(() => Promise.reject(new Error('Resolve conflicts')))).toBe(
        false,
      ),
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
    await waitFor(() => expect(result.current.operation.data).toEqual({ operation: 'merge' }))
    expect(result.current.error).toEqual(new Error('Resolve conflicts'))
    await waitFor(() => expect(result.current.pending).toBe(false))
  })

  it('prevents synchronous duplicate actions and actions from another workspace while pending', async () => {
    const { wrapper } = setup()
    let finish: ((value: unknown) => void) | undefined
    const action = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const duplicate = vi.fn().mockResolvedValue({})
    const first = renderHook(() => useGitManagement('/repo', true), { wrapper })
    const second = renderHook(() => useGitManagement('/other', true), { wrapper })
    let completed: Promise<boolean> | undefined
    await act(async () => {
      completed = first.result.current.run(action)
      expect(await first.result.current.run(duplicate)).toBe(false)
    })
    await waitFor(() => expect(second.result.current.pending).toBe(true))
    await act(async () => expect(await second.result.current.run(duplicate)).toBe(false))
    expect(duplicate).not.toHaveBeenCalled()
    await act(async () => {
      finish?.({})
      await completed
    })
    await waitFor(() => expect(first.result.current.pending).toBe(false))
    await waitFor(() => expect(second.result.current.pending).toBe(false))
  })
})
