import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navigationHistoryStore } from '@/features/navigation/navigationHistory'
import { useNavigationHistory } from '@/features/navigation/useNavigationHistory'

describe('useNavigationHistory', () => {
  beforeEach(() => navigationHistoryStore.getState().reset(''))

  it('records active files and navigates through the typed callback', () => {
    const onNavigate = vi.fn()
    const { result, rerender } = renderHook(
      ({ path }) =>
        useNavigationHistory({
          workspaceKey: 'external:/workspace',
          currentLocation: { kind: 'file', path, view: 'edit' },
          onNavigate,
        }),
      { initialProps: { path: 'one.md' } },
    )
    rerender({ path: 'two.md' })

    act(() => result.current.back())
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'file', path: 'one.md', view: 'edit' })
    act(() => result.current.forward())
    expect(onNavigate).toHaveBeenLastCalledWith({ kind: 'file', path: 'two.md', view: 'edit' })
  })

  it('records explicit edit positions and resets when the workspace changes', () => {
    const onNavigate = vi.fn()
    const { result, rerender } = renderHook(
      ({ workspaceKey }) =>
        useNavigationHistory({ workspaceKey, currentLocation: null, onNavigate }),
      { initialProps: { workspaceKey: 'external:/workspace' } },
    )
    act(() => result.current.visit({ kind: 'heading', path: 'guide.md', slug: 'setup' }))
    expect(result.current.recentLocations).toEqual([
      { kind: 'heading', path: 'guide.md', slug: 'setup' },
    ])

    rerender({ workspaceKey: 'external:/other' })
    expect(result.current.recentLocations).toEqual([])
    act(() => result.current.back())
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('records the current location again when another workspace has the same relative path', () => {
    const location = { kind: 'file' as const, path: 'README.md', view: 'edit' as const }
    const { result, rerender } = renderHook(
      ({ workspaceKey }) =>
        useNavigationHistory({ workspaceKey, currentLocation: location, onNavigate: vi.fn() }),
      { initialProps: { workspaceKey: 'external:/one' } },
    )

    rerender({ workspaceKey: 'external:/two' })
    expect(result.current.recentLocations).toEqual([location])
  })
})
