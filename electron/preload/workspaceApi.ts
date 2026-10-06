import { ipcRenderer, type IpcRenderer } from 'electron'

import { nativeIpcChannels, type NativeIpcChannel } from '@electron/channels'
import {
  isAssetBytes,
  isAssetCapability,
  isPathActionAck,
  isTextPreview,
  type Validator,
} from '@electron/preload/workspaceValidators'
import type { AssetApi } from '@electron/types'
import type { ElectronWorkspacePathApi } from '@/runtime/electron'

type WorkspaceIpcRenderer = Pick<IpcRenderer, 'invoke'>

type WorkspacePreloadSurfaces = {
  assets: AssetApi
  workspace: ElectronWorkspacePathApi
}

const invalidResponse = (surface: string): Error => new Error(`Invalid ${surface} response`)

const invokeValidated = async <T>(
  renderer: WorkspaceIpcRenderer,
  channel: NativeIpcChannel,
  validator: Validator<T>,
  surface: string,
  request: unknown,
): Promise<T> => {
  const value: unknown = await renderer.invoke(channel, request)
  if (!validator(value)) throw invalidResponse(surface)
  return value
}

const invokePathAction = async (
  renderer: WorkspaceIpcRenderer,
  channel: NativeIpcChannel,
  surface: string,
  path: string,
): Promise<void> => {
  await invokeValidated(renderer, channel, isPathActionAck, surface, { path })
}

export const createWorkspacePreloadSurfaces = (
  renderer: WorkspaceIpcRenderer = ipcRenderer,
): WorkspacePreloadSurfaces => ({
  assets: {
    issueCapability: (request) =>
      invokeValidated(
        renderer,
        nativeIpcChannels.assetsIssueCapability,
        isAssetCapability,
        'assets.issueCapability',
        request,
      ),
    readBytes: (request) =>
      invokeValidated(
        renderer,
        nativeIpcChannels.assetsReadBytes,
        isAssetBytes,
        'assets.readBytes',
        request,
      ),
  },
  workspace: {
    openPathInSystem: (path) =>
      invokePathAction(
        renderer,
        nativeIpcChannels.workspaceOpenPathInSystem,
        'workspace.openPathInSystem',
        path,
      ),
    readTextPreview: (path, limitBytes) =>
      invokeValidated(
        renderer,
        nativeIpcChannels.workspaceReadTextPreview,
        isTextPreview,
        'workspace.readTextPreview',
        { limit_bytes: limitBytes, path },
      ),
    revealPathInSystem: (path) =>
      invokePathAction(
        renderer,
        nativeIpcChannels.workspaceRevealPathInSystem,
        'workspace.revealPathInSystem',
        path,
      ),
    copyAbsolutePathToClipboard: (path) =>
      invokePathAction(
        renderer,
        nativeIpcChannels.workspaceCopyAbsolutePath,
        'workspace.copyAbsolutePathToClipboard',
        path,
      ),
  },
})
