import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'

export type WorkspaceSidecarIdentity = {
  workspaceId: string
  workspaceInstanceId: string
  canonicalRoot: string
  engineDataDir: string
  sessionToken: string
}

export type CreateWorkspaceSidecarIdentityOptions = {
  appDataDir: string
  indexPath: string
  sessionToken?: string
  workspaceId: string
}

export const createWorkspaceSidecarIdentity = (
  options: CreateWorkspaceSidecarIdentityOptions,
): WorkspaceSidecarIdentity => {
  const canonicalRoot = path.resolve(options.indexPath)
  const workspaceInstanceId = stableWorkspaceInstanceId(options.workspaceId, canonicalRoot)
  const engineDataDir = path.join(options.appDataDir, 'workspaces', workspaceInstanceId)
  const sessionToken =
    options.sessionToken ?? createHash('sha256').update(randomBytes(32)).digest('hex')

  return {
    workspaceId: options.workspaceId,
    workspaceInstanceId,
    canonicalRoot,
    engineDataDir,
    sessionToken,
  }
}

const stableWorkspaceInstanceId = (workspaceId: string, canonicalRoot: string) =>
  createHash('sha256').update(`${workspaceId}\n${canonicalRoot}`).digest('hex').slice(0, 32)
