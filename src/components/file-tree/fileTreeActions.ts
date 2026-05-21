import type { NodeApi } from 'react-arborist'
import { createFileLabel } from '@/logic/paths'
import { fsApi } from '@/services/fsApi'
import type { FileTreeNode } from '@/logic/fileTree'
import { writeClipboardText } from '@/runtime/clipboard'
import { revealPathInSystem } from '@/runtime/opener'

export const appendChildPath = (parentPath: string, name: string) =>
  [parentPath, name].filter(Boolean).join('/')

export const parentPath = (path: string) => path.split('/').slice(0, -1).join('/')

export const renamePath = (path: string, nextName: string) =>
  [...path.split('/').slice(0, -1), nextName].filter(Boolean).join('/')

export const getCreateParentPath = (node: NodeApi<FileTreeNode> | null) => {
  if (!node || node.isRoot) return ''
  return node.data.type === 'folder' ? node.data.path : parentPath(node.data.path)
}

const escapeMarkdownLinkLabel = (label: string) => label.replace(/\\/g, '\\\\').replace(/]/g, '\\]')

export const createMarkdownLink = (path: string) =>
  `[${escapeMarkdownLinkLabel(createFileLabel(path))}](<${path.replace(/>/g, '%3E')}>)`

export const copyText = async (value: string) => {
  try {
    await writeClipboardText(value)
    return
  } catch {
    await navigator.clipboard?.writeText(value)
  }
}

export const copyAbsolutePath = async (path: string) => {
  const metadata = await fsApi.getPathMetadata(path)
  await copyText(metadata.absolute_path)
}

export const revealPath = async (path: string) => {
  const metadata = await fsApi.getPathMetadata(path)
  await revealPathInSystem(metadata.absolute_path)
}

export const openPathInSystem = async (path: string) => {
  await fsApi.openPathInSystem(path)
}

export const reportFileTreeActionError = (action: string) => (error: unknown) => {
  console.error(`${action} failed`, error)
}
