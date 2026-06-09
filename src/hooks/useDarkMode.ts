import { usePreferencesStore } from '@/store/usePreferencesStore'

export const useDarkMode = () => {
  const theme = usePreferencesStore((state) => state.theme)
  return theme === 'dark' || theme === 'marko-dark'
}
