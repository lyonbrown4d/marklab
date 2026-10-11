import { slugify } from '@/logic/paths'

export type PlateHeadingIndexEntry = {
  blockIndex: number
  level: number
  slug: string
  text: string
}

const getNodeText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  if ('text' in node && typeof node.text === 'string') return node.text
  if (!('children' in node) || !Array.isArray(node.children)) return ''
  return node.children.map(getNodeText).join('')
}

const getHeadingLevel = (node: unknown) => {
  if (!node || typeof node !== 'object' || !('type' in node)) return null
  const match = /^h([1-6])$/.exec(String(node.type))
  return match ? Number(match[1]) : null
}

export const buildPlateHeadingIndex = (nodes: readonly unknown[]): PlateHeadingIndexEntry[] => {
  const usedSlugs = new Map<string, number>()
  const headings: PlateHeadingIndexEntry[] = []
  nodes.forEach((node, blockIndex) => {
    const level = getHeadingLevel(node)
    if (!level) return
    const text = getNodeText(node).trim()
    const baseSlug = slugify(text) || `heading-${headings.length + 1}`
    const duplicateIndex = usedSlugs.get(baseSlug) ?? 0
    usedSlugs.set(baseSlug, duplicateIndex + 1)
    headings.push({
      blockIndex,
      level,
      slug: duplicateIndex === 0 ? baseSlug : `${baseSlug}-${duplicateIndex}`,
      text,
    })
  })
  return headings
}

export const findPlateActiveHeading = (
  headings: readonly PlateHeadingIndexEntry[],
  blockIndex: number,
) => {
  let lower = 0
  let upper = headings.length - 1
  let match: PlateHeadingIndexEntry | null = null
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2)
    const candidate = headings[middle]
    if (!candidate) break
    if (candidate.blockIndex <= blockIndex) {
      match = candidate
      lower = middle + 1
    } else {
      upper = middle - 1
    }
  }
  return match
}
