import fs from 'node:fs/promises'
import path from 'node:path'

import { BrowserWindow } from 'electron'

import type { FsRootInfo } from '@electron/services/workspace/types'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'

export type PathOpenTarget = { kind: 'directory' | 'file'; path: string }

export const setWorkspaceRoot = async (
  workspace: WorkspaceService,
  root: FsRootInfo,
): Promise<FsRootInfo> => {
  if (root.kind === 'single') return workspace.setSingleFile({ path: root.path })
  if (root.kind === 'external') return workspace.setRoot({ path: root.path })
  return workspace.setRoot(null)
}

export const parsePathOpenTarget = async (value: unknown): Promise<PathOpenTarget> => {
  const raw =
    value && typeof value === 'object' && 'path' in value
      ? (value as Record<string, unknown>).path
      : value
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('path must be a string')
  if (raw.includes('\0')) throw new Error('path contains invalid characters')

  const resolved = path.resolve(raw)
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat) throw new Error('path does not exist')
  if (stat.isDirectory()) return { kind: 'directory', path: resolved }
  if (stat.isFile()) return { kind: 'file', path: resolved }
  throw new Error('path must be a file or directory')
}

export const setWorkspaceTarget = async (
  workspace: WorkspaceService,
  target: PathOpenTarget,
): Promise<FsRootInfo> =>
  target.kind === 'directory'
    ? workspace.setRoot({ path: target.path })
    : workspace.setSingleFile({ path: target.path })

export const workspaceRootForTarget = (
  target: PathOpenTarget,
): Pick<FsRootInfo, 'kind' | 'path'> => ({
  kind: target.kind === 'directory' ? 'external' : 'single',
  path: target.path,
})

export const sourceWindowForEvent = (
  event: Electron.IpcMainInvokeEvent | null,
  primary: BrowserWindow | null,
): BrowserWindow | null =>
  (event ? BrowserWindow.fromWebContents(event.sender) : null) ??
  BrowserWindow.getFocusedWindow() ??
  primary
