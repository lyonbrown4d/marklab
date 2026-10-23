import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useWorkspaceLinkNavigation } from '@/pages/hooks/useWorkspaceLinkNavigation'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { clearPendingHeadingNavigation, headingNavigationStore } from '@/utils/editorNavigation'
import type { WorkspaceTreeExistenceResult } from '@/types/workspaceTree'

const messages = vi.hoisted(() => ({ t: (key: string) => key }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => messages }))
vi.mock('@/services/workspaceTreeApi', () => ({ workspaceTreeApi: { pathsExist: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

type Options = Parameters<typeof useWorkspaceLinkNavigation>[0]
const source = 'notes/current.md'
const workspaceKey = 'external:/workspace'
const options = (overrides: Partial<Options> = {}): Options => ({
  activePath: source,
  workspaceKey,
  interactionActive: true,
  files: [{ kind: 'file', path: source }],
  onOpenFile: vi.fn(),
  onOpenFileView: vi.fn(),
  ...overrides,
})
const existence = (path: string): WorkspaceTreeExistenceResult => ({
  existing: path ? [path] : [],
  generation: 1,
  revision: 0,
  root: { kind: 'external', path: '/workspace' },
})
const renderNavigation = (props: Options) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return renderHook((next: Options) => useWorkspaceLinkNavigation(next), {
    initialProps: props,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  clearPendingHeadingNavigation()
  useWorkspaceStore.setState({
    rootKind: 'external',
    rootPath: '/workspace',
    treeGeneration: 1,
    treeRevision: 0,
  })
})

describe('workspace links with heading fragments', () => {
  it('queues the decoded heading and opens a loaded Markdown file in edit mode', () => {
    const path = 'notes/other.md'
    const props = options({ files: [{ kind: 'file', path }] })
    const { result } = renderNavigation(props)

    act(() => result.current.openLink(`other.md#${encodeURIComponent('中文总结')}`, source))

    expect(props.onOpenFileView).toHaveBeenCalledWith(path, 'edit')
    expect(props.onOpenFile).not.toHaveBeenCalled()
    expect(headingNavigationStore.getState().requests[`${workspaceKey}:${path}`]).toEqual({
      path,
      slug: '中文总结',
      workspaceKey,
    })
    expect(workspaceTreeApi.pathsExist).not.toHaveBeenCalled()
  })

  it('resolves an unloaded extensionless Markdown link before requesting its heading', async () => {
    const path = 'guides/other.md'
    const props = options()
    vi.mocked(workspaceTreeApi.pathsExist).mockResolvedValue(existence(path))
    const { result } = renderNavigation(props)

    act(() => result.current.openLink('../guides/other#API%20Usage', source))

    await waitFor(() => expect(props.onOpenFileView).toHaveBeenCalledWith(path, 'edit'))
    expect(headingNavigationStore.getState().requests[`${workspaceKey}:${path}`]).toEqual({
      path,
      slug: 'api-usage',
      workspaceKey,
    })
  })

  it('does not open or queue a heading from a lookup completed after switching workspaces', async () => {
    let complete: (value: WorkspaceTreeExistenceResult) => void = () => {}
    vi.mocked(workspaceTreeApi.pathsExist).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve
      }),
    )
    const props = options()
    const { result, rerender } = renderNavigation(props)
    act(() => result.current.openLink('other.md#summary', source))
    act(() => useWorkspaceStore.setState({ rootPath: '/second', treeGeneration: 2 }))
    rerender({ ...props, workspaceKey: 'external:/second' })

    await act(async () => complete(existence('notes/other.md')))

    expect(props.onOpenFile).not.toHaveBeenCalled()
    expect(props.onOpenFileView).not.toHaveBeenCalled()
    expect(headingNavigationStore.getState().requests).toEqual({})
  })

  it('rejects a loaded link from a retained surface whose workspace has already changed', () => {
    const props = options({ files: [{ kind: 'file', path: 'notes/other.md' }] })
    const { result } = renderNavigation(props)
    act(() => useWorkspaceStore.setState({ rootPath: '/second', treeGeneration: 2 }))

    act(() => result.current.openLink('other.md#summary', source))

    expect(props.onOpenFileView).not.toHaveBeenCalled()
    expect(headingNavigationStore.getState().requests).toEqual({})
  })

  it('keeps PDF fragments out of heading navigation and preserves normal Markdown open behavior', () => {
    const props = options({
      files: [
        { kind: 'file', path: 'notes/brief.pdf' },
        { kind: 'file', path: 'notes/other.md' },
      ],
    })
    const { result } = renderNavigation(props)

    act(() => result.current.openLink('brief.pdf#page=3', source))
    act(() => result.current.openLink('other.md', source))

    expect(props.onOpenFile).toHaveBeenCalledWith('notes/brief.pdf')
    expect(props.onOpenFile).toHaveBeenCalledWith('notes/other.md')
    expect(props.onOpenFileView).not.toHaveBeenCalled()
    expect(headingNavigationStore.getState().requests).toEqual({})
  })

  it('does not queue a heading for a missing linked file', async () => {
    const props = options()
    vi.mocked(workspaceTreeApi.pathsExist).mockResolvedValue(existence(''))
    const { result } = renderNavigation(props)

    act(() => result.current.openLink('missing.md#summary', source))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('notFound.title'))
    expect(props.onOpenFileView).not.toHaveBeenCalled()
    expect(headingNavigationStore.getState().requests).toEqual({})
  })

  it('reports a failed existence lookup without queuing a heading or opening a file', async () => {
    const props = options()
    vi.mocked(workspaceTreeApi.pathsExist).mockRejectedValue(new Error('Unavailable workspace'))
    const { result } = renderNavigation(props)

    act(() => result.current.openLink('other.md#summary', source))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('editor.openFileFailed'))
    expect(props.onOpenFileView).not.toHaveBeenCalled()
    expect(headingNavigationStore.getState().requests).toEqual({})
  })
})
