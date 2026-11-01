import { createRef, StrictMode, useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { workspaceLayoutApi, type WorkspaceLayout } from '@/services/workspaceLayoutApi'
import { captureDockLayout } from '@/features/workbench/dockPersistence'
import {
  WorkspaceDock,
  type DockLabels,
  type WorkspaceDockHandle,
  type WorkspaceDockProps,
} from '@/features/workbench/WorkspaceDock'

vi.mock('@/services/workspaceLayoutApi', () => ({
  workspaceLayoutApi: { get: vi.fn(), set: vi.fn() },
}))
const layouts = new Map<string, WorkspaceLayout>()

const labels: DockLabels = {
  loadingLayout: 'Loading layout',
  loadLayoutFailed: 'Could not load layout',
  saveLayoutFailed: 'Could not save layout',
  splitRight: 'Split right',
  splitDown: 'Split down',
  moveToGroup: 'Move to group',
  group: (index) => `Group ${index}`,
  close: 'Close',
  closeOthers: 'Close others',
  closeRight: 'Close right',
  closeAll: 'Close all',
}
beforeEach(() => {
  layouts.clear()
  vi.mocked(workspaceLayoutApi.get)
    .mockReset()
    .mockImplementation(async (workspaceKey) => ({
      layout: layouts.get(workspaceKey) ?? null,
      session_generation: 7,
    }))
  vi.mocked(workspaceLayoutApi.set)
    .mockReset()
    .mockImplementation(async (workspaceKey, _, layout) => {
      const snapshot = captureDockLayout(layout)
      if (!snapshot) throw new Error('Invalid test layout')
      layouts.set(workspaceKey, snapshot)
      return { saved: true }
    })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('keeps the editor instance and local state through splitting and callback updates; close X waits for saving', async () => {
  const mounted = vi.fn()
  const onError = vi.fn()
  const unmounted = vi.fn()
  const Editor = ({ id }: { id: string }) => {
    const [value, setValue] = useState('initial')
    useEffect(() => {
      mounted(id)
      return () => unmounted(id)
    }, [id])
    return (
      <input
        aria-label={`Editor ${id}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    )
  }
  const ref = createRef<WorkspaceDockHandle>()
  let finish: (() => void) | undefined
  const before = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const props: WorkspaceDockProps = {
    workspaceKey: 'test',
    onError,
    initialTabs: [{ id: 'a', route: '/files/edit/a.md', title: 'a.md', kind: 'document' }],
    labels,
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onTabsChanged: vi.fn(),
    onBeforeClose: before,
    renderPanel: (tab) => <Editor id={tab.id} />,
  }
  const view = render(<WorkspaceDock ref={ref} {...props} />)
  const original = await screen.findByLabelText('Editor a')
  fireEvent.change(original, { target: { value: 'draft' } })
  act(() =>
    ref.current!.open(
      { id: 'copy', route: '/files/edit/a.md', title: 'copy.md', kind: 'document' },
      { referenceId: 'a', direction: 'right' },
    ),
  )
  await screen.findByLabelText('Editor copy')
  const onActivate = vi.fn()
  view.rerender(<WorkspaceDock ref={ref} {...props} onActivate={onActivate} />)
  expect(screen.getByLabelText('Editor a')).toBe(original)
  expect((original as HTMLInputElement).value).toBe('draft')
  expect(mounted.mock.calls.filter(([id]) => id === 'a')).toHaveLength(1)
  expect(unmounted).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Close a.md' }))
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.getByLabelText('Editor a')).toBe(original)
  await act(async () => {
    finish?.()
    await Promise.resolve()
  })
  expect(screen.queryByLabelText('Editor a')).toBeNull()
  expect(before).toHaveBeenCalledTimes(1)
  await act(async () => {
    await flushEditorChanges()
  })
  expect(onError).not.toHaveBeenCalled()
  expect(Object.keys(layouts.get('test')?.panels ?? {})).toEqual(['copy'])
})

it('uses the tab menu to split the same route and restores the split without reopening initial tabs', async () => {
  const ref = createRef<WorkspaceDockHandle>()
  const props: WorkspaceDockProps = {
    workspaceKey: 'restore',
    initialTabs: [{ id: 'a', route: '/workspace/graph', title: 'Graph', kind: 'graph' }],
    labels,
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onTabsChanged: vi.fn(),
    renderPanel: (tab) => <span data-testid={tab.id}>{tab.id}</span>,
  }
  const first = render(<WorkspaceDock ref={ref} {...props} />)
  await screen.findByTestId('a')
  const trigger = screen.getByTitle('Graph')
  fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })
  fireEvent.click(await screen.findByText('Split down'))
  expect(ref.current!.getTabs()).toHaveLength(2)
  expect(ref.current!.getTabs().map((tab) => tab.route)).toEqual([
    '/workspace/graph',
    '/workspace/graph',
  ])
  await act(() => flushEditorChanges())
  first.unmount()
  render(
    <WorkspaceDock
      ref={ref}
      {...props}
      initialTabs={[{ id: 'unrelated', route: '/files/edit/new', title: 'new', kind: 'other' }]}
    />,
  )
  await screen.findByTestId('a')
  expect(ref.current!.getTabs()).toHaveLength(2)
  expect(ref.current!.getTabs().some((tab) => tab.id === 'unrelated')).toBe(false)
})

it('keeps the imperative controller alive through StrictMode effect replay', async () => {
  const ref = createRef<WorkspaceDockHandle>()
  const onActivate = vi.fn()
  render(
    <StrictMode>
      <WorkspaceDock
        ref={ref}
        workspaceKey="strict"
        labels={labels}
        initialTabs={[{ id: 'a', route: '/workspace/graph', title: 'Graph', kind: 'graph' }]}
        renderPanel={(tab) => <span data-testid={tab.id}>{tab.id}</span>}
        onActivate={onActivate}
        onClose={vi.fn()}
        onTabsChanged={vi.fn()}
      />
    </StrictMode>,
  )
  await screen.findByTestId('a')
  await act(async () => {
    await Promise.resolve()
  })
  act(() => ref.current!.open({ id: 'b', route: '/files/edit/b', title: 'B', kind: 'document' }))
  await screen.findByTestId('b')
  expect(ref.current!.getActiveTab()?.id).toBe('b')
  expect(onActivate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'b' }))
  act(() => ref.current!.close('b'))
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.queryByTestId('b')).toBeNull()
})

it('waits for native loading, ignores an old workspace response, and never writes initial panes', async () => {
  let resolveOld: ((value: Awaited<ReturnType<typeof workspaceLayoutApi.get>>) => void) | undefined
  vi.mocked(workspaceLayoutApi.get).mockImplementation((key) =>
    key === 'old'
      ? new Promise((resolve) => {
          resolveOld = resolve
        })
      : Promise.resolve({ layout: null, session_generation: 8 }),
  )
  const props: WorkspaceDockProps = {
    workspaceKey: 'old',
    labels,
    initialTabs: [{ id: 'a', route: '/workspace/graph', title: 'Graph', kind: 'graph' }],
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onTabsChanged: vi.fn(),
    renderPanel: (tab) => <span data-testid={tab.id}>{tab.id}</span>,
  }
  const view = render(<WorkspaceDock {...props} />)
  expect(screen.getByText('Loading layout').getAttribute('role')).toBe('status')
  expect(screen.queryByTestId('a')).toBeNull()
  view.rerender(<WorkspaceDock {...props} workspaceKey="new" />)
  await screen.findByTestId('a')
  await act(async () => {
    resolveOld?.({ layout: null, session_generation: 7 })
    await Promise.resolve()
  })
  await flushEditorChanges()
  expect(props.onActivate).toHaveBeenCalledTimes(1)
  expect(workspaceLayoutApi.set).not.toHaveBeenCalled()
})

it('keeps the editor usable after a failed load without overwriting unread native data', async () => {
  vi.mocked(workspaceLayoutApi.get).mockRejectedValue(new Error('database unavailable'))
  const ref = createRef<WorkspaceDockHandle>()
  const onError = vi.fn()
  render(
    <WorkspaceDock
      ref={ref}
      workspaceKey="failed"
      labels={labels}
      initialTabs={[{ id: 'a', route: '/workspace/graph', title: 'Graph', kind: 'graph' }]}
      onActivate={vi.fn()}
      onClose={vi.fn()}
      onTabsChanged={vi.fn()}
      onError={onError}
      renderPanel={(tab) => <span data-testid={tab.id}>{tab.id}</span>}
    />,
  )
  await screen.findByTestId('a')
  expect(screen.getByText('Could not load layout').getAttribute('role')).toBe('alert')
  act(() => ref.current!.open({ id: 'b', route: '/files/edit/b.md', title: 'B', kind: 'document' }))
  await screen.findByTestId('b')
  await flushEditorChanges()
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Could not load layout' }),
  )
  expect(workspaceLayoutApi.set).not.toHaveBeenCalled()
})

it('restores a saved empty workspace without reopening initial tabs or writing on clean close', async () => {
  layouts.set('empty', {
    grid: {
      root: { type: 'branch', data: [] },
      width: 1000,
      height: 800,
      orientation: 'HORIZONTAL',
    },
    panels: {},
  })
  const onReady = vi.fn()
  const view = render(
    <WorkspaceDock
      workspaceKey="empty"
      labels={labels}
      onReady={onReady}
      initialTabs={[{ id: 'a', route: '/workspace/graph', title: 'Graph', kind: 'graph' }]}
      onActivate={vi.fn()}
      onClose={vi.fn()}
      onTabsChanged={vi.fn()}
      renderPanel={(tab) => <span data-testid={tab.id}>{tab.id}</span>}
    />,
  )
  await waitFor(() => expect(onReady).toHaveBeenCalled())
  expect(screen.queryByTestId('a')).toBeNull()
  await flushEditorChanges()
  view.unmount()
  expect(workspaceLayoutApi.set).not.toHaveBeenCalled()
})
