import path from 'node:path'
import pLimit from 'p-limit'
import type { MarkdownBlock, MarkdownInline } from '@electron/services/export/markdown'

export type LocalImage = {
  data: Buffer
  type: 'bmp' | 'gif' | 'jpg' | 'png'
}

export type LocalImageMap = ReadonlyMap<string, LocalImage>
export type DocxImageMap = LocalImageMap

export type LocalImageOptions = {
  readImage?: (url: string) => Promise<Buffer | null>
}

export const maxLocalImageBytes = 15 * 1024 * 1024
const maxTotalImageBytes = 100 * 1024 * 1024
const maxImageCount = 50
const supportedTypes = new Map<string, LocalImage['type']>([
  ['.bmp', 'bmp'],
  ['.gif', 'gif'],
  ['.jpeg', 'jpg'],
  ['.jpg', 'jpg'],
  ['.png', 'png'],
] as const)

export const loadLocalImages = async (
  blocks: MarkdownBlock[],
  options: LocalImageOptions,
): Promise<LocalImageMap> => {
  if (!options.readImage) return new Map()
  const readImage = options.readImage
  const urls = Array.from(new Set(collectImageUrls(blocks))).slice(0, maxImageCount)
  const limit = pLimit(4)
  let remainingBytes = maxTotalImageBytes
  const loaded = await Promise.all(
    urls.map((url) =>
      limit(async () => {
        const image = await loadLocalImage(url, readImage)
        if (!image || image.data.length > remainingBytes) return [url, null] as const
        remainingBytes -= image.data.length
        return [url, image] as const
      }),
    ),
  )
  return new Map(
    loaded.filter((entry): entry is readonly [string, LocalImage] => Boolean(entry[1])),
  )
}

export const loadDocxImages = loadLocalImages

const loadLocalImage = async (
  url: string,
  readImage: NonNullable<LocalImageOptions['readImage']>,
): Promise<LocalImage | null> => {
  const rawPath = safeRelativeImagePath(url)
  if (!rawPath) return null
  const type = supportedTypes.get(path.extname(rawPath).toLowerCase())
  if (!type) return null
  const data = await readImage(url).catch(() => null)
  if (!data || data.length <= 0 || data.length > maxLocalImageBytes) return null
  return { data, type }
}

const safeRelativeImagePath = (url: string): string | null => {
  const rawPath = url.split(/[?#]/, 1)[0]
  if (
    !rawPath ||
    /^[a-z][a-z\d+.-]*:/i.test(rawPath) ||
    path.isAbsolute(rawPath) ||
    path.win32.isAbsolute(rawPath) ||
    path.posix.isAbsolute(rawPath)
  )
    return null
  try {
    return decodeURIComponent(rawPath)
  } catch {
    return null
  }
}

const collectImageUrls = (blocks: MarkdownBlock[]): string[] => {
  return blocks.flatMap((block) => {
    if (block.type === 'blockquote') return collectImageUrls(block.blocks)
    if (block.type === 'heading' || block.type === 'paragraph')
      return inlineImageUrls(block.children)
    if (block.type === 'list') return block.items.flatMap(inlineImageUrls)
    if (block.type === 'table')
      return [...block.header, ...block.rows.flat()].flatMap(inlineImageUrls)
    return []
  })
}

const inlineImageUrls = (inlines: MarkdownInline[]): string[] => {
  return inlines.flatMap((inline) => {
    if (inline.type === 'image') return [inline.url]
    if ('children' in inline) return inlineImageUrls(inline.children)
    return []
  })
}
