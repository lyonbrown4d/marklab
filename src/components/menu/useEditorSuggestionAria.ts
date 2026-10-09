import { useEffect, useRef } from 'react'
import type { PlateEditor } from 'platejs/react'

type UseEditorSuggestionAriaOptions = {
  activeOptionId: string | null
  editor: PlateEditor
  menuId: string
  open: boolean
}

export const useEditorSuggestionAria = ({
  activeOptionId,
  editor,
  menuId,
  open,
}: UseEditorSuggestionAriaOptions) => {
  const controlsRef = useRef<string | null>(null)

  useEffect(() => {
    const root = editor.api.toDOMNode(editor)
    if (!root) return
    const ownsActiveMenu = () =>
      Boolean(controlsRef.current && root.getAttribute('aria-controls') === controlsRef.current)

    if (open) {
      const menu = document.getElementById(menuId)
      const listbox = menu?.querySelector<HTMLElement>('[role="listbox"]')
      if (activeOptionId) root.setAttribute('aria-activedescendant', activeOptionId)
      else root.removeAttribute('aria-activedescendant')
      root.setAttribute('aria-autocomplete', 'list')
      controlsRef.current = listbox?.id || menuId
      root.setAttribute('aria-controls', controlsRef.current)
      root.setAttribute('aria-expanded', 'true')
    } else if (ownsActiveMenu()) {
      root.removeAttribute('aria-activedescendant')
      root.removeAttribute('aria-autocomplete')
      root.removeAttribute('aria-controls')
      root.setAttribute('aria-expanded', 'false')
      controlsRef.current = null
    }

    return () => {
      if (!ownsActiveMenu()) return
      root.removeAttribute('aria-activedescendant')
      root.removeAttribute('aria-autocomplete')
      root.removeAttribute('aria-controls')
      root.setAttribute('aria-expanded', 'false')
      controlsRef.current = null
    }
  }, [activeOptionId, editor, menuId, open])
}
