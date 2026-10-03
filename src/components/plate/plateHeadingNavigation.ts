import type { PlateEditor } from 'platejs/react'
import type { Path } from 'platejs'
import { slugify } from '@/logic/paths'

const isHeadingNode = (node: unknown): node is { type: string } => {
  if (!node || typeof node !== 'object' || !('type' in node)) return false
  return /^h[1-6]$/.test(String(node.type))
}

export const findPlateHeadingPath = (editor: PlateEditor, targetSlug: string): Path | null => {
  const usedSlugs = new Map<string, number>()
  let headingIndex = 0

  for (let index = 0; index < editor.children.length; index += 1) {
    const node = editor.children[index]
    if (!isHeadingNode(node)) continue

    const baseSlug = slugify(editor.api.string([index]).trim()) || `heading-${headingIndex + 1}`
    const usedCount = usedSlugs.get(baseSlug) ?? 0
    usedSlugs.set(baseSlug, usedCount + 1)
    const slug = usedCount === 0 ? baseSlug : `${baseSlug}-${usedCount}`
    headingIndex += 1

    if (slug === targetSlug) return [index]
  }

  return null
}

export const focusPlateHeading = (
  editor: PlateEditor,
  slug: string,
  options: { scroll?: boolean } = {},
) => {
  const path = findPlateHeadingPath(editor, slug)
  if (!path) return false

  const point = editor.api.start(path)
  if (!point) return false
  editor.tf.select(point)
  editor.tf.focus()
  if (options.scroll !== false) {
    try {
      editor.api.scrollIntoView(point)
    } catch {
      // The target may be temporarily unmounted by chunking; selection still restores intent.
    }
  }
  return true
}
