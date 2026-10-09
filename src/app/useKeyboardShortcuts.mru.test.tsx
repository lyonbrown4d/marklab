import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from '@/app/useKeyboardShortcuts'
import type { WorkspaceTab } from '@/store/appTypes'

const hotkeys = vi.hoisted(() => ({
  definitions: [] as Array<{
    hotkey: string
    callback: () => void
    options?: { ignoreInputs?: boolean }
  }>,
}))

vi.mock('@tanstack/react-hotkeys', () => ({
  useHotkeys: (definitions: typeof hotkeys.definitions) => {
    hotkeys.definitions = definitions
  },
}))
vi.mock('@/app/useWebTabShortcutBridge', () => ({ useWebTabShortcutBridge: vi.fn() }))

const tabs: WorkspaceTab[] = [
  { kind: 'file', path: 'one.md', view: 'edit' },
  { kind: 'file', path: 'two.md', view: 'edit' },
  { kind: 'file', path: 'three.md', view: 'edit' },
]

const createProps = (activeTabId: string) => ({
  activeTabId,
  shortcutOverrides: {},
  tabs,
  viewMode: 'wysiwyg' as const,
  onCloseActiveTab: vi.fn(),
  onCreateFile: vi.fn(),
  onOpenCommandPalette: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenTab: vi.fn(),
  onSetViewMode: vi.fn(),
  onToggleRightSidebar: vi.fn(),
  onToggleSidebar: vi.fn(),
  onToggleTerminal: vi.fn(),
  onToggleReadOnly: vi.fn(),
  onNavigateBack: vi.fn(),
  onNavigateForward: vi.fn(),
})

const trigger = (hotkey: string) => {
  const definition = hotkeys.definitions.find((candidate) => candidate.hotkey === hotkey)
  expect(definition).toBeDefined()
  act(() => definition?.callback())
}

describe('useKeyboardShortcuts MRU and history navigation', () => {
  beforeEach(() => {
    hotkeys.definitions = []
    vi.clearAllMocks()
  })

  it('uses recent activation order for Control+Tab without reordering tabs', () => {
    const initial = createProps('file:edit:one.md')
    const { rerender } = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: initial,
    })
    rerender({ ...initial, activeTabId: 'file:edit:two.md' })
    rerender({ ...initial, activeTabId: 'file:edit:three.md' })

    trigger('Control+Tab')

    expect(initial.onOpenTab).toHaveBeenCalledWith('file:edit:two.md')
    expect(tabs.map((tab) => (tab.kind === 'file' ? tab.path : ''))).toEqual([
      'one.md',
      'two.md',
      'three.md',
    ])
  })

  it('walks all recently used tabs while Control remains held', () => {
    const initial = createProps('file:edit:one.md')
    const { rerender } = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: initial,
    })
    rerender({ ...initial, activeTabId: 'file:edit:two.md' })
    rerender({ ...initial, activeTabId: 'file:edit:three.md' })

    trigger('Control+Tab')
    rerender({ ...initial, activeTabId: 'file:edit:two.md' })
    trigger('Control+Tab')

    expect(initial.onOpenTab).toHaveBeenNthCalledWith(1, 'file:edit:two.md')
    expect(initial.onOpenTab).toHaveBeenNthCalledWith(2, 'file:edit:one.md')
  })

  it('starts a new MRU cycle after Control is released', () => {
    const initial = createProps('file:edit:one.md')
    const { rerender } = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: initial,
    })
    rerender({ ...initial, activeTabId: 'file:edit:two.md' })
    rerender({ ...initial, activeTabId: 'file:edit:three.md' })

    trigger('Control+Tab')
    rerender({ ...initial, activeTabId: 'file:edit:two.md' })
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }))
    trigger('Control+Tab')

    expect(initial.onOpenTab).toHaveBeenNthCalledWith(2, 'file:edit:three.md')
  })

  it('keeps the same MRU snapshot during a long-held Control cycle', () => {
    vi.useFakeTimers()
    const initial = createProps('file:edit:one.md')
    const { rerender, unmount } = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: initial,
    })
    rerender({ ...initial, activeTabId: 'file:edit:two.md' })
    rerender({ ...initial, activeTabId: 'file:edit:three.md' })

    trigger('Control+Tab')
    rerender({ ...initial, activeTabId: 'file:edit:two.md' })
    act(() => vi.advanceTimersByTime(1_000))
    trigger('Control+Tab')

    expect(initial.onOpenTab).toHaveBeenNthCalledWith(2, 'file:edit:one.md')
    unmount()
    vi.useRealTimers()
  })

  it('removes closed tabs from an active MRU cycle', () => {
    const initial = createProps('file:edit:one.md')
    const { rerender } = renderHook((props) => useKeyboardShortcuts(props), {
      initialProps: initial,
    })
    rerender({ ...initial, activeTabId: 'file:edit:two.md' })
    rerender({ ...initial, activeTabId: 'file:edit:three.md' })
    trigger('Control+Tab')

    rerender({
      ...initial,
      activeTabId: 'file:edit:three.md',
      tabs: tabs.filter((tab) => tab.kind !== 'file' || tab.path !== 'two.md'),
    })
    trigger('Control+Tab')

    expect(initial.onOpenTab).toHaveBeenLastCalledWith('file:edit:one.md')
  })

  it('maps Alt+Left and Alt+Right to navigation history', () => {
    const props = createProps('file:edit:one.md')
    renderHook(() => useKeyboardShortcuts(props))

    trigger('Alt+ArrowLeft')
    trigger('Alt+ArrowRight')

    expect(props.onNavigateBack).toHaveBeenCalledTimes(1)
    expect(props.onNavigateForward).toHaveBeenCalledTimes(1)
    expect(
      hotkeys.definitions
        .filter((definition) => definition.hotkey.startsWith('Alt+Arrow'))
        .map((definition) => definition.options?.ignoreInputs),
    ).toEqual([false, false])
  })
})
