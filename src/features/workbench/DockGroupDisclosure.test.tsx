import { createRef } from 'react'
import userEvent from '@testing-library/user-event'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceDock, type WorkspaceDockHandle } from '@/features/workbench/WorkspaceDock'
import { useNativeSurfaceOcclusionStore } from '@/app/nativeSurfaceOcclusion'
import i18n from '@/i18n/setup'

vi.mock('@/services/workspaceLayoutApi', () => ({
  workspaceLayoutApi: {
    get: vi.fn(async () => ({ layout: null, session_generation: 7 })),
    set: vi.fn(async () => ({ saved: true })),
  },
}))

beforeEach(async () => {
  await i18n.changeLanguage('en-US')
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('restores per-group hover preview, keyboard pinning and Escape without replacing SDK tabs', async () => {
  const ref = createRef<WorkspaceDockHandle>()
  render(
    <WorkspaceDock
      ref={ref}
      workspaceKey="floating-tabs"
      initialTabs={[
        { id: 'first', route: '/first', title: 'First document', kind: 'document' },
        { id: 'second', route: '/second', title: 'Second document', kind: 'document' },
      ]}
      labels={{
        loadingLayout: 'Loading',
        loadLayoutFailed: 'Load failed',
        saveLayoutFailed: 'Save failed',
        splitRight: 'Split right',
        splitDown: 'Split down',
        moveToGroup: 'Move to group',
        group: (index) => `Group ${index}`,
        close: 'Close',
        closeOthers: 'Close others',
        closeRight: 'Close right',
        closeAll: 'Close all',
      }}
      renderPanel={(tab) => <div>{tab.route}</div>}
      onActivate={vi.fn()}
      onClose={vi.fn()}
      onTabsChanged={vi.fn()}
    />,
  )
  await waitFor(() => expect(ref.current?.getTabs()).toHaveLength(2))
  const pill = screen.getByRole('button', { name: /Show open files: First document/ })
  expect(pill).toHaveAttribute('aria-expanded', 'false')
  const header = pill.closest('.dv-tabs-and-actions-container')!
  const nativeTabs = header.querySelectorAll('.dv-tab')
  expect(nativeTabs).toHaveLength(2)

  vi.useFakeTimers({ shouldAdvanceTime: true })
  fireEvent.pointerEnter(header)
  act(() => vi.advanceTimersByTime(150))
  expect(screen.getByRole('button', { name: 'Keep tabs open' })).toBeInTheDocument()
  expect(Object.keys(useNativeSurfaceOcclusionStore.getState().reasons)).toHaveLength(1)
  fireEvent.pointerLeave(header)
  act(() => vi.advanceTimersByTime(210))
  expect(screen.queryByRole('button', { name: 'Keep tabs open' })).not.toBeInTheDocument()
  expect(useNativeSurfaceOcclusionStore.getState().reasons).toEqual({})

  // Native button keyboard activation pins the disclosure, including after hover leaves.
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  screen.getByRole('button', { name: /Show open files/ }).focus()
  await user.keyboard('{Enter}')
  fireEvent.pointerLeave(header)
  act(() => vi.advanceTimersByTime(250))
  const collapse = screen.getByRole('button', { name: 'Collapse tabs' })
  expect(collapse).toBeInTheDocument()
  expect(header.querySelector('.dv-tab')).toBe(nativeTabs[0])
  fireEvent.keyDown(collapse, { key: 'Escape' })
  act(() => vi.advanceTimersByTime(20))
  expect(screen.getByRole('button', { name: /Show open files/ })).toHaveFocus()
  expect(useNativeSurfaceOcclusionStore.getState().reasons).toEqual({})

  vi.useRealTimers()
  act(() => {
    ref.current?.open(
      { id: 'third', route: '/third', title: 'Third document', kind: 'document' },
      { referenceId: 'first', direction: 'right' },
    )
  })
  const thirdPill = await screen.findByRole('button', { name: /Show open files: Third document/ })
  fireEvent.click(thirdPill)
  expect(screen.getByRole('button', { name: /Show open files: First document/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  expect(screen.getByRole('button', { name: 'Collapse tabs' })).toBeInTheDocument()
  // A preview can be pinned, then explicitly collapsed with the same control.
  fireEvent.click(screen.getByRole('button', { name: 'Collapse tabs' }))
  expect(
    screen.getByRole('button', { name: /Show open files: Third document/ }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Collapse tabs' })).not.toBeInTheDocument()
})
