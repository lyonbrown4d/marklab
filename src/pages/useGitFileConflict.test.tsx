import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGitFileConflict } from '@/pages/useGitFileConflict'
import { isDesktopRuntime } from '@/runtime/environment'
import { gitApiForWorkspace, type GitStatusSnapshot } from '@/services/gitApi'

const { getStatus } = vi.hoisted(() => ({ getStatus: vi.fn() }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: vi.fn(() => true) }))
vi.mock('@/services/gitApi', () => ({ gitApiForWorkspace: vi.fn(() => ({ getStatus })) }))
const status = (conflicted = false, repository = true): GitStatusSnapshot => ({
  repo: { workdir: null, git_dir: null, branch: null, head: null, is_repository: repository },
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: conflicted
    ? [{ old_path: null, path: 'note.md', status: 'conflicted', detail: 'UU' }]
    : [],
})
const options = {
  rootKind: 'external' as const,
  rootPath: '/repo',
  path: 'note.md',
  content: '# Normal',
}
const markers = '<<<<<<< ours\nleft\n=======\nright\n>>>>>>> theirs'
const clients: QueryClient[] = []
const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  clients.push(client)
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isDesktopRuntime).mockReturnValue(true)
  getStatus.mockResolvedValue(status())
})
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Git file conflict editor gate', () => {
  it('blocks marker content until Git proves a conflict, using the workspace-bound API', async () => {
    let resolve!: (value: GitStatusSnapshot) => void
    getStatus.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { wrapper } = setup()
    const { result } = renderHook(() => useGitFileConflict({ ...options, content: markers }), {
      wrapper,
    })
    expect(result.current).toEqual({ conflict: false, checking: true })
    await act(async () => {
      resolve(status(true))
    })
    await waitFor(() => expect(result.current).toEqual({ conflict: true, checking: false }))
    expect(gitApiForWorkspace).toHaveBeenCalledWith('/repo')
    expect(getStatus).toHaveBeenCalledWith('/repo')
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it.each([true, false])(
    'allows literal marker examples when Git reports no conflict (repo=%s)',
    async (repository) => {
      getStatus.mockResolvedValue(status(false, repository))
      const { wrapper } = setup()
      const { result } = renderHook(() => useGitFileConflict({ ...options, content: markers }), {
        wrapper,
      })
      await waitFor(() => expect(result.current.checking).toBe(false))
      expect(result.current.conflict).toBe(false)
    },
  )

  it.each([1, 4, 32, 1024])('recognizes complete custom-width %i markers', async (width) => {
    const content = `${'<'.repeat(width)} ours\nleft\n${'='.repeat(width)}\nright\n${'>'.repeat(width)} theirs`
    const { wrapper } = setup()
    const { result } = renderHook(() => useGitFileConflict({ ...options, content }), { wrapper })
    expect(result.current.checking).toBe(true)
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it('uses cached conflicts for a modify/delete file without markers', () => {
    const { client, wrapper } = setup()
    client.setQueryData(['git-status', '/repo'], status(true))
    const { result } = renderHook(() => useGitFileConflict(options), { wrapper })
    expect(result.current.conflict).toBe(true)
  })

  it('observes Git status published after an ordinary document is already open', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useGitFileConflict(options), { wrapper })
    expect(result.current).toEqual({ conflict: false, checking: false })
    expect(getStatus).not.toHaveBeenCalled()
    await act(async () => {
      client.setQueryData(['git-status', '/repo'], status(true))
    })
    await waitFor(() => expect(result.current.conflict).toBe(true))
  })

  it('isolates both the workspace and file path when the route changes', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(['git-status', '/repo'], status(true))
    const { result, rerender } = renderHook((props) => useGitFileConflict(props), {
      initialProps: options,
      wrapper,
    })
    expect(result.current.conflict).toBe(true)
    rerender({ ...options, path: 'other.md' })
    expect(result.current.conflict).toBe(false)
    rerender({ ...options, rootPath: '/different' })
    expect(result.current).toEqual({ conflict: false, checking: false })
    await act(async () => {
      client.setQueryData(['git-status', '/repo'], status(true))
    })
    expect(result.current.conflict).toBe(false)
    expect(client.getQueryData(['git-status', '/different'])).toBeUndefined()
  })

  it('checks newly appeared markers even when the clean repository snapshot is fresh', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(['git-status', '/repo'], status())
    const { result, rerender } = renderHook((props) => useGitFileConflict(props), {
      initialProps: options,
      wrapper,
    })
    let resolve!: (value: GitStatusSnapshot) => void
    getStatus.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    rerender({ ...options, content: markers })
    expect(result.current.checking).toBe(true)
    await act(async () => {
      resolve(status(true))
    })
    await waitFor(() => expect(result.current.conflict).toBe(true))
  })

  it('skips Git requests for ordinary documents and incomplete marker examples', () => {
    const { wrapper } = setup()
    const { rerender } = renderHook((props) => useGitFileConflict(props), {
      initialProps: options,
      wrapper,
    })
    rerender({ ...options, content: '<<<<<<< opening only\ntext' })
    expect(getStatus).not.toHaveBeenCalled()
  })

  it('skips Git for single-file mode and outside the desktop runtime, even with cached conflicts', () => {
    const { client, wrapper } = setup()
    client.setQueryData(['git-status', '/repo'], status(true))
    const { result, rerender } = renderHook(
      (rootKind: 'single' | 'external') =>
        useGitFileConflict({ ...options, content: markers, rootKind }),
      { initialProps: 'single' as 'single' | 'external', wrapper },
    )
    expect(result.current).toEqual({ conflict: false, checking: false })
    vi.mocked(isDesktopRuntime).mockReturnValue(false)
    rerender('external')
    expect(result.current).toEqual({ conflict: false, checking: false })
    expect(getStatus).not.toHaveBeenCalled()
  })

  it('finishes checking after a Git error without treating marker text as proof', async () => {
    getStatus.mockRejectedValue(new Error('Git unavailable'))
    const { wrapper } = setup()
    const { result } = renderHook(() => useGitFileConflict({ ...options, content: markers }), {
      wrapper,
    })
    await waitFor(() => expect(result.current).toEqual({ conflict: false, checking: false }))
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it('polls a known repository so an external merge reaches an already open document', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const { client, wrapper } = setup()
    client.setQueryData(['git-status', '/repo'], status())
    getStatus.mockResolvedValue(status(true))
    const { result } = renderHook(() => useGitFileConflict(options), { wrapper })
    expect(getStatus).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001)
    })
    expect(result.current.conflict).toBe(true)
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it('does not keep polling a marker example after Git reports that there is no repository', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    getStatus.mockResolvedValue(status(false, false))
    const { wrapper } = setup()
    const { result } = renderHook(() => useGitFileConflict({ ...options, content: markers }), {
      wrapper,
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.checking).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it('skips large incomplete marker examples without a Git lookup', () => {
    const content = '<<<<<<< example\nleft\n=======\n'.repeat(20_000)
    const { wrapper } = setup()
    const { result } = renderHook(() => useGitFileConflict({ ...options, content }), { wrapper })
    expect(result.current).toEqual({ conflict: false, checking: false })
    expect(getStatus).not.toHaveBeenCalled()
  })

  it('accepts CRLF labels without a final newline and ignores mismatched widths', async () => {
    const { wrapper } = setup()
    const { result, rerender } = renderHook(
      (content) => useGitFileConflict({ ...options, content }),
      {
        initialProps: '<<<< ours\r\nleft\r\n===\r\nright\r\n>>>> theirs',
        wrapper,
      },
    )
    expect(result.current.checking).toBe(false)
    expect(getStatus).not.toHaveBeenCalled()
    rerender('<<<< ours\r\nleft\r\n====\r\nright\r\n>>>> theirs')
    expect(result.current.checking).toBe(true)
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(getStatus).toHaveBeenCalledTimes(1)
  })
})
