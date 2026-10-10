import { useCallback, useEffect } from 'react'
import type { PlateEditor } from 'platejs/react'
import { slugify } from '@/logic/paths'
import { clearActiveHeading, setActiveHeading } from '@/utils/editorNavigation'

const isHeadingNode = (node: unknown): node is { type: string } => {
  if (!node || typeof node !== 'object' || !('type' in node)) return false
  return /^h[1-6]$/.test(String(node.type))
}

export const getPlateActiveHeadingSlug = (editor: PlateEditor): string | null => {
  const blockIndex = editor.selection?.focus.path[0]
  if (typeof blockIndex !== 'number' || blockIndex < 0) return null

  const usedSlugs = new Map<string, number>()
  let headingIndex = 0
  let activeSlug: string | null = null

  for (let index = 0; index < editor.children.length && index <= blockIndex; index += 1) {
    const node = editor.children[index]
    if (!isHeadingNode(node)) continue

    const baseSlug = slugify(editor.api.string([index]).trim()) || `heading-${headingIndex + 1}`
    const usedCount = usedSlugs.get(baseSlug) ?? 0
    usedSlugs.set(baseSlug, usedCount + 1)
    activeSlug = usedCount === 0 ? baseSlug : `${baseSlug}-${usedCount}`
    headingIndex += 1
  }

  return activeSlug
}

export const usePlateActiveHeading = (
  activePath: string | null,
  editor: PlateEditor,
  enabled: boolean,
) => {
  const syncActiveHeading = useCallback(() => {
    if (!activePath || !enabled) return
    setActiveHeading(activePath, getPlateActiveHeadingSlug(editor))
  }, [activePath, editor, enabled])

  useEffect(() => {
    if (!activePath) return
    if (enabled) syncActiveHeading()
    else clearActiveHeading(activePath)

    return () => clearActiveHeading(activePath)
  }, [activePath, enabled, syncActiveHeading])

  return syncActiveHeading
}
