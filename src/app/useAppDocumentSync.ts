import { useCallback, useEffect, useLayoutEffect } from 'react'
import { useDesktopReadySignal } from '@/app/useDesktopReadySignal'
import { useUserThemeCss } from '@/hooks/useUserThemeCss'
import { isDesktopRuntime } from '@/runtime/environment'
import { listen } from '@/runtime/events'
import { getElectronRuntime } from '@/runtime/electron'
import type { ThemeMode } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { isDarkThemeMode } from '@/logic/themes'
import { flushEditorChangesForClose } from '@/app/editorCloseLifecycle'

type UseAppDocumentSyncOptions = {
  theme: ThemeMode
}

type SystemThemePayload = {
  colorMode: 'light' | 'dark'
}

const isSystemThemePayload = (value: unknown): value is SystemThemePayload => {
  if (!value || typeof value !== 'object' || !('colorMode' in value)) return false
  const { colorMode } = value as { colorMode?: unknown }
  return colorMode === 'light' || colorMode === 'dark'
}

const applyDocumentTheme = (theme: ThemeMode): void => {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('dark', isDarkThemeMode(theme))
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

  const syncSystemAppearance = useCallback(
    (colorMode: SystemThemePayload['colorMode']) => {
      syncSystemTheme(colorMode)
      const currentPreferences = usePreferencesStore.getState()
      if (currentPreferences.themeMode === 'system') {
        applyDocumentTheme(currentPreferences.theme)
      }
    },
    [syncSystemTheme],
  )

  useUserThemeCss(customThemeId)

  useLayoutEffect(() => {
    if (themeMode !== 'system') return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => syncSystemAppearance(media.matches ? 'dark' : 'light')
    sync()
    media.addEventListener('change', sync)
    return () => {
      media.removeEventListener('change', sync)
    }
  }, [syncSystemAppearance, themeMode])

  useEffect(() => {
    if (themeMode !== 'system') return
    if (!isDesktopRuntime()) return

    let disposed = false
    let unlisten: (() => void) | null = null
    void listen<unknown>('system-theme-changed', (event) => {
      if (isSystemThemePayload(event.payload)) syncSystemAppearance(event.payload.colorMode)
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten()
        return
      }
      unlisten = nextUnlisten
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [syncSystemAppearance, themeMode])

  useDesktopReadySignal()

  useEffect(() => {
    if (!isDesktopRuntime()) return
    return getElectronRuntime().window.onCloseRequested(flushEditorChangesForClose)
  }, [])

  useLayoutEffect(() => {
    applyDocumentTheme(theme)
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

  // Native window blur and the main-process close/quit barrier own buffer persistence.
  // Async IPC during beforeunload is too late and races the frozen mutation gate.

  return {
    immersiveZenMode,
  }
}
