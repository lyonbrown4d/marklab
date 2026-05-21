import { useAppStore } from '@/store/useAppStore'

export const useDarkMode = () => {
  const theme = useAppStore((state) => state.theme)
  return theme === 'dark' || theme === 'marko-dark'
}
