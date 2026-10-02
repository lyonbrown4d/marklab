import type { FsWorkspaceIndex } from '@/services/fsApi'

const FNV_OFFSET = 0x811c9dc5
const SECOND_OFFSET = 0x9e3779b9
const FNV_PRIME = 0x01000193
const SECOND_PRIME = 0x5f356495

export const createWorkspaceGraphRevision = (index: FsWorkspaceIndex): string => {
  let first = FNV_OFFSET
  let second = SECOND_OFFSET

  const write = (value: string | number | boolean | null | undefined) => {
    const text = value == null ? '' : String(value)
    const framed = `${text.length}:`
    for (let position = 0; position < framed.length; position += 1) {
      const code = framed.charCodeAt(position)
      first = Math.imul(first ^ code, FNV_PRIME)
      second = Math.imul(second ^ code, SECOND_PRIME)
    }
    for (let position = 0; position < text.length; position += 1) {
      const code = text.charCodeAt(position)
      first = Math.imul(first ^ code, FNV_PRIME)
      second = Math.imul(second ^ code, SECOND_PRIME)
    }
  }

  write(index.files.length)
  for (const file of index.files) {
    write(file.path)
    write(file.headings.length)
    for (const heading of file.headings) {
      write(heading.path)
      write(heading.level)
      write(heading.text)
      write(heading.slug)
      write(heading.line)
    }

    write(file.links.length)
    for (const link of file.links) {
      write(link.source_path)
      write(link.text)
      write(link.target)
      write(link.link_type)
      write(link.target_path)
      write(link.target_anchor)
      write(link.target_heading_slug)
      write(link.is_external)
      write(link.line)
    }

    const assets = file.assets ?? []
    write(assets.length)
    for (const asset of assets) {
      write(asset.source_path)
      write(asset.text)
      write(asset.target)
      write(asset.target_path)
      write(asset.is_external)
      write(asset.media_type)
    }
  }

  const paths = index.paths ?? []
  write(paths.length)
  for (const path of paths) write(path)

  const assetPaths = index.asset_paths ?? []
  write(assetPaths.length)
  for (const path of assetPaths) write(path)

  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`
}
