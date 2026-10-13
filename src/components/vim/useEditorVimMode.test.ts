import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { fileViewTabId } from '@/logic/tabs'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useVimModeStore } from '@/store/useVimModeStore'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useCurrentTabVimModeEnabled, useEditorVimMode } from '@/components/vim/useEditorVimMode'

const workspaceKey = 'external:/notes'
const sourceTabId = fileViewTabId('note.md', 'source')
const editTabId = fileViewTabId('note.md', 'edit')

beforeEach(() => {
  usePreferencesStore.setState({ vimModeEnabled: false })
  useVimModeStore.setState({ perTabOverrides: {} })
  useWorkspaceStore.setState({
    rootKind: 'external',
    rootPath: '/notes',
    activeTabId: sourceTabId,
    tabs: [
      { kind: 'file', path: 'note.md', view: 'source' },
      { kind: 'file', path: 'note.md', view: 'edit' },
    ],
  })
})

describe('editor Vim enablement', () => {
  it('uses the global default when no file path is available', () => {
    useVimModeStore.getState().setTabOverride(workspaceKey, sourceTabId, true)
    const { result } = renderHook(() =>
      useEditorVimMode({ workspaceKey, path: null, tabId: sourceTabId }),
    )
    expect(result.current).toBe(false)
    act(() => usePreferencesStore.getState().setVimModeEnabled(true))
    expect(result.current).toBe(true)
  })

  it('follows the global default until an explicit tab override is set or reset', () => {
    const { result } = renderHook(() => useEditorVimMode({ workspaceKey, path: 'note.md' }))
    expect(result.current).toBe(false)
    act(() => usePreferencesStore.getState().setVimModeEnabled(true))
    expect(result.current).toBe(true)
    act(() => useVimModeStore.getState().setTabOverride(workspaceKey, sourceTabId, false))
    expect(result.current).toBe(false)
    act(() => useVimModeStore.getState().setTabOverride(workspaceKey, sourceTabId, undefined))
    expect(result.current).toBe(true)
  })

  it('infers the active matching file tab and preserves explicit tab identities', () => {
    useVimModeStore.getState().setTabOverride(workspaceKey, sourceTabId, true)
    useVimModeStore.getState().setTabOverride(workspaceKey, editTabId, false)
    const inferred = renderHook(() => useEditorVimMode({ workspaceKey, path: 'note.md' }))
    const explicit = renderHook(() =>
      useEditorVimMode({ workspaceKey, path: 'note.md', tabId: sourceTabId }),
    )
    const current = renderHook(() => useCurrentTabVimModeEnabled())
    expect(inferred.result.current).toBe(true)
    expect(current.result.current).toBe(true)
    act(() => useWorkspaceStore.getState().setActiveTabId(editTabId))
    expect(inferred.result.current).toBe(false)
    expect(current.result.current).toBe(false)
    expect(explicit.result.current).toBe(true)
  })

  it('uses source-tab fallback for unmatched paths and other workspaces', () => {
    useVimModeStore
      .getState()
      .setTabOverride(workspaceKey, fileViewTabId('other.md', 'source'), true)
    useVimModeStore.getState().setTabOverride('external:/other', sourceTabId, true)
    useVimModeStore.getState().setTabOverride(workspaceKey, editTabId, false)
    useWorkspaceStore.setState({ activeTabId: editTabId })
    const otherPath = renderHook(() => useEditorVimMode({ workspaceKey, path: 'other.md' }))
    const otherWorkspace = renderHook(() =>
      useEditorVimMode({ workspaceKey: 'external:/other', path: 'note.md' }),
    )
    expect(otherPath.result.current).toBe(true)
    expect(otherWorkspace.result.current).toBe(true)
  })
})
