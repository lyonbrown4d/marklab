import { ipcRenderer, type IpcRenderer } from 'electron'

import { nativeIpcChannels, type NativeIpcChannel } from '@electron/channels'
import {
  isAssetCapability,
  isPathActionAck,
  isTextPreview,
  isWorkspaceTreeChildrenResult,
  isWorkspaceTreeDeltaEvent,
  isWorkspaceTreeExistenceResult,
  isWorkspaceTreeInitialFileResult,
  isWorkspaceTreeSearchResult,
  type Validator,
} from '@electron/preload/workspaceValidators'
import type { AssetApi } from '@electron/types'
import type { ElectronWorkspacePathApi } from '@/runtime/electron'
import type { WorkspaceTreeApi } from '@/types/workspaceTree'

type WorkspaceIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>

type WorkspacePreloadSurfaces = {
  assets: AssetApi
  workspace: ElectronWorkspacePathApi
  workspaceTree: WorkspaceTreeApi
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
  workspaceTree: {
    initialFile: async () => {
      const value: unknown = await renderer.invoke(nativeIpcChannels.workspaceTreeInitialFile)
      if (!isWorkspaceTreeInitialFileResult(value)) {
        throw invalidResponse('workspaceTree.initialFile')
      }
      return value
    },
    listChildren: (request) =>
      invokeValidated(
        renderer,
        nativeIpcChannels.workspaceTreeListChildren,
        isWorkspaceTreeChildrenResult,
        'workspaceTree.listChildren',
        request,
      ),
    pathsExist: (request) =>
      invokeValidated(
        renderer,
        nativeIpcChannels.workspaceTreePathsExist,
        isWorkspaceTreeExistenceResult,
        'workspaceTree.pathsExist',
        request,
      ),
    search: (request) =>
      invokeValidated(
        renderer,
        nativeIpcChannels.workspaceTreeSearch,
        isWorkspaceTreeSearchResult,
        'workspaceTree.search',
        request,
      ),
    onChanged: (handler) => {
      const listener = (_event: unknown, payload: unknown) => {
        if (isWorkspaceTreeDeltaEvent(payload)) handler(payload)
      }
      renderer.on(nativeIpcChannels.workspaceTreeChanged, listener)
      return () => renderer.removeListener(nativeIpcChannels.workspaceTreeChanged, listener)
    },
  },
})
