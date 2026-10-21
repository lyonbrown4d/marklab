import type { TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'

// A virtual anchor follows the tracked Slate range and its scroll container.
export const createPlateInsertionAnchor = (
  editor: PlateEditor,
  target: { current: TRange | null },
) => {
  let contextElement: HTMLElement | undefined
  try {
    contextElement = editor.api.toDOMNode(editor) ?? undefined
  } catch {
    // Pure editor operations can run before mounting a DOM surface.
  }
  return {
    contextElement,
    getBoundingClientRect: (): DOMRect => {
      try {
        const rect =
          target.current && editor.api.toDOMRange(target.current)?.getBoundingClientRect()
        if (rect && (rect.width || rect.height)) return rect
      } catch {
        // Document replacement can invalidate a range before its overlay unmounts.
      }
      return contextElement?.getBoundingClientRect() ?? new DOMRect()
    },
  }
}
