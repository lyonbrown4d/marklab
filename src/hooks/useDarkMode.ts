import { usePreferencesStore } from '@/store/usePreferencesStore'
import { isDarkThemeMode } from '@/logic/themes'

export const useDarkMode = () => {
  const theme = usePreferencesStore((state) => state.theme)
  return isDarkThemeMode(theme)
}
