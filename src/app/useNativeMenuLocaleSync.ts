import { useEffect } from 'react'
import { appApi } from '@/services/appApi'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'
import { usePreferencesStore } from '@/store/usePreferencesStore'

export const useNativeMenuLocaleSync = () => {
  const locale = usePreferencesStore((state) => state.locale)

  useEffect(() => {
    void appApi.setNativeMenuLocale(locale).catch((error) => {
      rendererDiagnostics.warn('app.menu', 'locale-sync-failed', error)
      if (import.meta.env.DEV) {
        console.warn('Failed to sync native menu locale', error)
      }
    })
  }, [locale])
}
