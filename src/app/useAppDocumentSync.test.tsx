import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppDocumentSync } from '@/app/useAppDocumentSync'
import type { ThemeMode } from '@/store/appTypes'
import { darkThemeValues, lightThemeValues } from '@/logic/themes'

const mocks = vi.hoisted(() => ({
  flushBuffers: vi.fn().mockResolvedValue(0),
  preferences: {
    autoSystemThemeSync: false,
    customThemeId: null,
    immersiveFocusMode: false,
    immersiveTypewriterMode: false,
    immersiveZenMode: false,
    motionAnimatedCursor: false,
    motionAnimatedPanels: false,
    motionSmoothScrolling: false,
    syncSystemTheme: vi.fn(),
    themeMode: 'light',
  },
}))
vi.mock('@/app/useDesktopReadySignal', () => ({ useDesktopReadySignal: vi.fn() }))
vi.mock('@/hooks/useUserThemeCss', () => ({ useUserThemeCss: vi.fn() }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }))
vi.mock('@/services/fsApi', () => ({ fsApi: { flushBuffers: mocks.flushBuffers } }))
vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (select: (state: typeof mocks.preferences) => unknown) =>
    select(mocks.preferences),
}))

beforeEach(() => {
  vi.restoreAllMocks()
  mocks.preferences.autoSystemThemeSync = false
  mocks.preferences.themeMode = 'light'
  mocks.preferences.syncSystemTheme.mockClear()
})

describe('document synchronization lifecycle', () => {
  it('leaves close-time persistence to the main-process shutdown barrier', () => {
    mocks.flushBuffers.mockClear()
    const { unmount } = renderHook(() => useAppDocumentSync({ theme: 'paper' }))
    act(() => {
      window.dispatchEvent(new Event('beforeunload'))
      window.dispatchEvent(new Event('blur'))
    })
    unmount()
    expect(mocks.flushBuffers).not.toHaveBeenCalled()
  })

  it('continues to synchronize the document theme', () => {
    const { rerender } = renderHook(
      ({ theme }: { theme: ThemeMode }) => useAppDocumentSync({ theme }),
      { initialProps: { theme: 'paper' } },
    )
    expect(document.documentElement.dataset.theme).toBe('paper')
    expect(document.documentElement).not.toHaveClass('dark')
    rerender({ theme: 'ink' })
    expect(document.documentElement.dataset.theme).toBe('ink')
    expect(document.documentElement).toHaveClass('dark')
    rerender({ theme: 'paper' })
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it.each(darkThemeValues)('enables shadcn dark variants for %s', (theme) => {
    renderHook(() => useAppDocumentSync({ theme }))
    expect(document.documentElement.dataset.theme).toBe(theme)
    expect(document.documentElement).toHaveClass('dark')
  })

  it.each(lightThemeValues)('disables shadcn dark variants for %s', (theme) => {
    document.documentElement.classList.add('dark')
    renderHook(() => useAppDocumentSync({ theme }))
    expect(document.documentElement.dataset.theme).toBe(theme)
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('synchronizes the initial system appearance and live changes, then unsubscribes', () => {
    const media = Object.assign(new EventTarget(), { matches: false })
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as MediaQueryList)
    mocks.preferences.themeMode = 'system'
    mocks.preferences.autoSystemThemeSync = true
    const { unmount } = renderHook(() => useAppDocumentSync({ theme: 'paper' }))
    expect(mocks.preferences.syncSystemTheme).toHaveBeenLastCalledWith('light')
    act(() => {
      media.matches = true
      media.dispatchEvent(new Event('change'))
    })
    expect(mocks.preferences.syncSystemTheme).toHaveBeenLastCalledWith('dark')
    unmount()
    mocks.preferences.syncSystemTheme.mockClear()
    media.dispatchEvent(new Event('change'))
    expect(mocks.preferences.syncSystemTheme).not.toHaveBeenCalled()
  })

  it.each(['light', 'dark'])('does not follow system changes in explicit %s mode', (mode) => {
    const matchMedia = vi.spyOn(window, 'matchMedia')
    mocks.preferences.themeMode = mode
    mocks.preferences.autoSystemThemeSync = true
    renderHook(() => useAppDocumentSync({ theme: mode === 'dark' ? 'ink' : 'paper' }))
    expect(matchMedia).not.toHaveBeenCalled()
    expect(mocks.preferences.syncSystemTheme).not.toHaveBeenCalled()
  })
})
