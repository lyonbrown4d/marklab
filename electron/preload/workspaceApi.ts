import { ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  nativeIpcChannels,
  transitionalNativeCommands,
  type NativeIpcChannel,
  type TransitionalNativeCommand,
} from '@electron/channels.js'
import { workspaceErrorCodes } from '@electron/types.js'
import type {
  AssetApi,
  WorkspaceLifecycleApi,
  WorkspaceResult,
  WorkspaceSessionApi,
} from '@electron/types.js'
import {
  hasExactKeys,
  isAssetBytes,
  isAssetCapability,
  isBufferStatus,
  isFlushAck,
  isLifecycleMessage,
  isPathActionAck,
  isReadFileResponse,
  isRecord,
  isSessionSeed,
  isSnapshotChanged,
  isSwitchToken,
  isWorkspaceDescriptor,
  type Validator,
} from '@electron/preload/workspaceValidators.js'

type WorkspacePreloadSurfaces = {
  assets: AssetApi
  lifecycle: WorkspaceLifecycleApi
  workspace: WorkspaceSessionApi
}

const workspacePathCommands = {
  openPathInSystem: 'workspace_open_path_in_system',
  revealPathInSystem: 'workspace_reveal_path_in_system',
  copyAbsolutePathToClipboard: 'workspace_copy_absolute_path',
} as const
type WorkspacePathCommand = (typeof workspacePathCommands)[keyof typeof workspacePathCommands]
type WorkspaceCommand = TransitionalNativeCommand | WorkspacePathCommand

const invalidResponse = (surface: string): Error => new Error('Invalid ' + surface + ' response')
const parseWorkspaceResult = <T>(
  value: unknown,
  validator: Validator<T>,
  surface: string,
): WorkspaceResult<T> => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') throw invalidResponse(surface)
  if (value.ok) {
    if (!hasExactKeys(value, ['ok', 'value']) || !validator(value.value)) {
      throw invalidResponse(surface)
    }
    return { ok: true, value: value.value }
  }
  if (!hasExactKeys(value, ['ok', 'error'])) throw invalidResponse(surface)
  const error = value.error
  if (!hasExactKeys(error, ['code', 'message']) || typeof error.message !== 'string') {
    throw invalidResponse(surface)
  }
  const code = workspaceErrorCodes.find((candidate) => candidate === error.code)
  if (!code) throw invalidResponse(surface)
  return { ok: false, error: { code, message: error.message } }
}

const invokeWorkspace = async <T>(
  command: WorkspaceCommand,
  validator: Validator<T>,
  surface: string,
  args?: unknown,
): Promise<WorkspaceResult<T>> => {
  const value: unknown = await ipcRenderer.invoke(nativeIpcChannels.commandInvoke, {
    command,
    args,
  })
  return parseWorkspaceResult(value, validator, surface)
}
const invokeValidated = async <T>(
  command: TransitionalNativeCommand,
  validator: Validator<T>,
  surface: string,
  args: unknown,
): Promise<T> => {
  const value: unknown = await ipcRenderer.invoke(nativeIpcChannels.commandInvoke, {
    command,
    args,
  })
  if (!validator(value)) throw invalidResponse(surface)
  return value
}
const listenValidated = <T>(
  channel: NativeIpcChannel,
  validator: Validator<T>,
  handler: (payload: T) => void,
): (() => void) => {
  const listener = (_event: IpcRendererEvent, payload: unknown) => {
    if (!validator(payload)) return
    handler(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export const createWorkspacePreloadSurfaces = (): WorkspacePreloadSurfaces => {
  const workspace: WorkspaceSessionApi = {
    getSession: () =>
      invokeWorkspace(
        transitionalNativeCommands.workspaceGetSession,
        isWorkspaceDescriptor,
        'workspace.getSession',
      ),
    readFile: (request) =>
      invokeWorkspace(
        transitionalNativeCommands.workspaceReadFile,
        isReadFileResponse,
        'workspace.readFile',
        request,
      ),
    updateBuffer: (request) =>
      invokeWorkspace(
        transitionalNativeCommands.workspaceUpdateBuffer,
        isBufferStatus,
        'workspace.updateBuffer',
        request,
      ),
    flushBuffers: (request) =>
      invokeWorkspace(
        transitionalNativeCommands.workspaceFlushBuffers,
        isFlushAck,
        'workspace.flushBuffers',
        request,
      ),
    prepareSwitch: (request) =>
      invokeWorkspace(
        transitionalNativeCommands.workspacePrepareSwitch,
        isSwitchToken,
        'workspace.prepareSwitch',
        request,
      ),
    commitRoot: (request) =>
      invokeWorkspace(
        transitionalNativeCommands.workspaceCommitRoot,
        isWorkspaceDescriptor,
        'workspace.commitRoot',
        request,
      ),
    commitSingleFile: (request) =>
      invokeWorkspace(
        transitionalNativeCommands.workspaceCommitSingleFile,
        isWorkspaceDescriptor,
        'workspace.commitSingleFile',
        request,
      ),
    cancelSwitch: (request) =>
      invokeWorkspace(
        transitionalNativeCommands.workspaceCancelSwitch,
        isSwitchToken,
        'workspace.cancelSwitch',
        request,
      ),
    openPathInSystem: (request) =>
      invokeWorkspace(
        workspacePathCommands.openPathInSystem,
        isPathActionAck,
        'workspace.openPathInSystem',
        request,
      ),
    revealPathInSystem: (request) =>
      invokeWorkspace(
        workspacePathCommands.revealPathInSystem,
        isPathActionAck,
        'workspace.revealPathInSystem',
        request,
      ),
    copyAbsolutePathToClipboard: (request) =>
      invokeWorkspace(
        workspacePathCommands.copyAbsolutePathToClipboard,
        isPathActionAck,
        'workspace.copyAbsolutePathToClipboard',
        request,
      ),
    onSnapshotChanged: (handler) =>
      listenValidated(nativeIpcChannels.workspaceSnapshotChanged, isSnapshotChanged, handler),
    onBufferStatus: (handler) =>
      listenValidated(nativeIpcChannels.workspaceBufferStatus, isBufferStatus, handler),
    onSessionChanged: (handler) =>
      listenValidated(nativeIpcChannels.workspaceSessionChanged, isWorkspaceDescriptor, handler),
    onSessionSeed: (handler) =>
      listenValidated(nativeIpcChannels.workspaceSessionSeed, isSessionSeed, handler),
  }
  const lifecycle: WorkspaceLifecycleApi = {
    workspaceReady: () => ipcRenderer.send(nativeIpcChannels.lifecycleWorkspaceReady),
    onWorkspacePrepare: (handler) =>
      listenValidated(nativeIpcChannels.lifecycleWorkspacePrepare, isLifecycleMessage, handler),
    ackWorkspacePrepare: (ack) =>
      ipcRenderer.send(nativeIpcChannels.lifecycleAckWorkspacePrepare, ack),
    onWorkspaceSeal: (handler) =>
      listenValidated(nativeIpcChannels.lifecycleWorkspaceSeal, isLifecycleMessage, handler),
    ackWorkspaceSeal: (ack) => ipcRenderer.send(nativeIpcChannels.lifecycleAckWorkspaceSeal, ack),
    onWorkspacePrepareCancelled: (handler) =>
      listenValidated(
        nativeIpcChannels.lifecycleWorkspacePrepareCancelled,
        isLifecycleMessage,
        handler,
      ),
  }
  const assets: AssetApi = {
    issueCapability: (request) =>
      invokeValidated(
        transitionalNativeCommands.assetsIssueCapability,
        isAssetCapability,
        'assets.issueCapability',
        request,
      ),
    readBytes: (request) =>
      invokeValidated(
        transitionalNativeCommands.assetsReadBytes,
        isAssetBytes,
        'assets.readBytes',
        request,
      ),
  }
  return { assets, lifecycle, workspace }
}
