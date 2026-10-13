import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from '@/app/useKeyboardShortcuts'
import { registerVimKeyboardScope } from '@/components/vim/vimKeyboardScope'

const native = vi.hoisted(() => ({ setOwnership: vi.fn(async () => {}) }))
vi.mock('@/runtime/window', () => ({ setVimKeyboardOwnership: native.setOwnership }))
vi.mock('@/app/useWebTabShortcutBridge', () => ({ useWebTabShortcutBridge: vi.fn() }))
const resources: (() => void)[] = []
afterEach(() => {
  cleanup()
  resources
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose())
  vi.restoreAllMocks()
})
beforeEach(() => {
  native.setOwnership.mockClear()
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})
const fixture = () => {
  const root = document.createElement('div')
  const input = document.createElement('textarea')
  root.append(input)
  document.body.append(root)
  resources.push(() => root.remove())
  const onOpenProject = vi.fn()
  const props = {
    activeTabId: null,
    shortcutOverrides: { 'file.openProject': ['Control+o'] },
    tabs: [],
    viewMode: 'source' as const,
    onOpenProject,
    onCloseActiveTab: vi.fn(),
    onCreateFile: vi.fn(),
    onOpenCommandPalette: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenTab: vi.fn(),
    onSetViewMode: vi.fn(),
    onToggleRightSidebar: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleTerminal: vi.fn(),
    onToggleReadOnly: vi.fn(),
    onNavigateBack: vi.fn(),
    onNavigateForward: vi.fn(),
  }
  renderHook(() => useKeyboardShortcuts(props))
  let release = () => {}
  act(() => {
    release = registerVimKeyboardScope(root)
    input.focus()
  })
  resources.push(release)
  return { root, input, onOpenProject, release }
}

describe('Vim app shortcut priority with the real hotkey manager', () => {
  it('leaves consumed Vim keys and IME events alone', () => {
    const { input, onOpenProject } = fixture()
    const consumed = (event: KeyboardEvent) => event.preventDefault()
    input.addEventListener('keydown', consumed)
    const event = new KeyboardEvent('keydown', {
      key: 'o',
      code: 'KeyO',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => input.dispatchEvent(event))
    expect(onOpenProject).not.toHaveBeenCalled()
    input.removeEventListener('keydown', consumed)
    fireEvent.keyDown(input, { key: 'o', code: 'KeyO', ctrlKey: true, isComposing: true })
    expect(onOpenProject).not.toHaveBeenCalled()
  })
  it('runs an unconsumed app shortcut after Vim has had the event', () => {
    const { input, onOpenProject } = fixture()
    fireEvent.keyDown(input, { key: 'o', code: 'KeyO', ctrlKey: true })
    expect(onOpenProject).toHaveBeenCalledOnce()
    expect(native.setOwnership).toHaveBeenLastCalledWith(true)
  })
  it('preserves existing app shortcut handling outside Vim', () => {
    const { input, release, onOpenProject } = fixture()
    act(release)
    const button = document.createElement('button')
    document.body.append(button)
    resources.push(() => button.remove())
    button.addEventListener('keydown', (event) => event.preventDefault())
    act(() => {
      button.focus()
    })
    fireEvent.keyDown(button, { key: 'o', code: 'KeyO', ctrlKey: true })
    expect(onOpenProject).toHaveBeenCalledOnce()
    expect(input).not.toHaveFocus()
  })
  it('keeps modified app keys working in ordinary inputs after focus changes', () => {
    const { input, release, onOpenProject } = fixture()
    act(release)
    fireEvent.keyDown(input, { key: 'o', code: 'KeyO', ctrlKey: true })
    expect(onOpenProject).toHaveBeenCalledOnce()
  })
  it('restores native menu shortcuts immediately when a focused Vim scope is removed', () => {
    const { release } = fixture()
    act(release)
    expect(native.setOwnership).toHaveBeenLastCalledWith(false)
  })
})
