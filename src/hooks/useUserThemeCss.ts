import { useEffect } from 'react'
import { userThemeApi } from '@/services/userThemeApi'

const STYLE_ELEMENT_ID = 'marklab-user-theme'

const getStyleElement = (): HTMLStyleElement => {
  const existing = document.getElementById(STYLE_ELEMENT_ID)
  if (existing instanceof HTMLStyleElement) return existing

  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.dataset.marklabUserTheme = 'true'
  document.head.appendChild(style)
  return style
}

export const useUserThemeCss = (themeId: string | null): void => {
  useEffect(() => {
    if (typeof document === 'undefined') return

    let cancelled = false
    const style = getStyleElement()

    if (!themeId) {
      style.textContent = ''
      return
    }

    void userThemeApi
      .readCss(themeId)
      .then((css) => {
        if (cancelled) return
        style.textContent = css
      })
      .catch(() => {
        if (cancelled) return
        style.textContent = ''
      })

    return () => {
      cancelled = true
    }
  }, [themeId])
}
