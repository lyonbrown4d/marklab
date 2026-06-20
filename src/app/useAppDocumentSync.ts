import { useEffect, useLayoutEffect } from 'react'
import { useDesktopReadySignal } from '@/app/useDesktopReadySignal'
import { useUserThemeCss } from '@/hooks/useUserThemeCss'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import type { ThemeMode } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type UseAppDocumentSyncOptions = {
  theme: ThemeMode
}

export const useAppDocumentSync = ({ theme }: UseAppDocumentSyncOptions) => {
  const motionSmoothScrolling = usePreferencesStore((store) => store.motionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((store) => store.motionAnimatedCursor)
  const motionAnimatedPanels = usePreferencesStore((store) => store.motionAnimatedPanels)
  const customThemeId = usePreferencesStore((store) => store.customThemeId)
  const themeMode = usePreferencesStore((store) => store.themeMode)
  const syncSystemTheme = usePreferencesStore((store) => store.syncSystemTheme)
  const immersiveZenMode = usePreferencesStore((store) => store.immersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((store) => store.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((store) => store.immersiveTypewriterMode)

  useUserThemeCss(customThemeId)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => syncSystemTheme(media.matches ? 'dark' : 'light')
    sync()
    media.addEventListener('change', sync)
    return () => {
      media.removeEventListener('change', sync)
    }
  }, [syncSystemTheme, themeMode])

  useDesktopReadySignal()

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.motionSmoothScrolling = motionSmoothScrolling
      ? 'true'
      : 'false'
    document.documentElement.dataset.motionCursor = motionAnimatedCursor ? 'true' : 'false'
    document.documentElement.dataset.motionPanels = motionAnimatedPanels ? 'true' : 'false'
    document.documentElement.dataset.customTheme = customThemeId ? 'true' : 'false'
    document.documentElement.dataset.immersiveZen = immersiveZenMode ? 'true' : 'false'
    document.documentElement.dataset.immersiveFocus = immersiveFocusMode ? 'true' : 'false'
    document.documentElement.dataset.immersiveTypewriter = immersiveTypewriterMode
      ? 'true'
      : 'false'
  }, [
    customThemeId,
    immersiveFocusMode,
    immersiveTypewriterMode,
    immersiveZenMode,
    motionAnimatedCursor,
    motionAnimatedPanels,
    motionSmoothScrolling,
    theme,
  ])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    const flushOnClose = () => {
      void fsApi.flushBuffers()
    }
    window.addEventListener('beforeunload', flushOnClose)
    return () => {
      window.removeEventListener('beforeunload', flushOnClose)
    }
  }, [])

  return {
    immersiveZenMode,
  }
}
