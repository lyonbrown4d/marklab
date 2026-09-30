import { createHash } from 'node:crypto'
import path from 'node:path'

import type { LocalHistoryWorkspace } from '@electron/services/localHistory/types.js'

const schemePattern = /^[a-z][a-z\d+.-]*:/i
const entryIdPattern =
  /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const normalizeLocalHistoryWorkspace = (workspace: LocalHistoryWorkspace): string => {
  if (!workspace || !['internal', 'external', 'single'].includes(workspace.kind)) {
    throw new Error('Local history workspace kind is invalid')
  }
  if (typeof workspace.path !== 'string' || !workspace.path.trim()) {
    throw new Error('Local history workspace path is required')
  }
  if (workspace.path.includes('\0') || !path.isAbsolute(workspace.path)) {
    throw new Error('Local history workspace path must be absolute')
  }
  const resolved = path.resolve(workspace.path)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export const normalizeLocalHistoryPath = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Local history relative path is required')
  }
  if (value.includes('\0'))
    throw new Error('Local history relative path contains invalid characters')
  if (
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    schemePattern.test(value)
  ) {
    throw new Error('Local history path must be a workspace-relative path')
  }

  const portable = value.replaceAll('\\', '/')
  if (portable.split('/').includes('..')) {
    throw new Error('Local history relative path cannot contain parent segments')
  }
  const normalized = path.posix.normalize(portable)
  if (normalized === '.' || normalized.startsWith('../')) {
    throw new Error('Local history relative path is invalid')
  }
  return normalized
}

export const validateLocalHistoryEntryId = (value: unknown): string => {
  if (typeof value !== 'string' || !entryIdPattern.test(value)) {
    throw new Error('Local history entry id is invalid')
  }
  return value
}

export const localHistoryFileDirectory = (
  storageRoot: string,
  workspace: LocalHistoryWorkspace,
  filePath: string,
): string => {
  const workspaceKey = hash(`${workspace.kind}\0${normalizeLocalHistoryWorkspace(workspace)}`)
  const fileKey = hash(normalizeLocalHistoryPath(filePath))
  return path.join(storageRoot, workspaceKey, fileKey)
}

const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
