export const workspaceErrorCodes = [
  'INVALID_REQUEST',
  'STALE_SESSION',
  'TRANSITION_IN_PROGRESS',
  'UPDATE_SEQUENCE_MISMATCH',
  'FLUSH_FAILED',
  'PREPARE_EXPIRED',
] as const

export type WorkspaceSessionIdentity = {
  session_id: string
  generation: number
}

export type WorkspaceRootKind = 'internal' | 'external' | 'single'

export type WorkspaceRoot = {
  kind: WorkspaceRootKind
  path: string
}

export type WorkspaceDescriptor = {
  session: WorkspaceSessionIdentity
  root: WorkspaceRoot
}

export type WorkspaceErrorCode = (typeof workspaceErrorCodes)[number]

export type WorkspaceError = {
  code: WorkspaceErrorCode
  message: string
}

export type WorkspaceResult<T> =
  | {
      ok: true
      value: T
    }
  | {
      ok: false
      error: WorkspaceError
    }

export type WorkspaceReadFileRequest = {
  session: WorkspaceSessionIdentity
  path: string
}

export type WorkspaceReadFileResponse = {
  session: WorkspaceSessionIdentity
  path: string
  content: string
}

export type WorkspaceUpdateBufferRequest = {
  session: WorkspaceSessionIdentity
  client_update_seq: number
  path: string
  content: string
}

export type WorkspaceBufferStatus = {
  session: WorkspaceSessionIdentity
  client_update_seq: number
  path: string
  revision: number
  dirty: boolean
}

export type WorkspaceUpdateBufferResponse = WorkspaceBufferStatus

export type WorkspaceFlushBuffersRequest = {
  session: WorkspaceSessionIdentity
  through_client_update_seq: number
}

export type WorkspaceFlushBuffersAck = {
  session: WorkspaceSessionIdentity
  through_client_update_seq: number
}

export type WorkspaceSwitchToken = {
  token: string
}

export type WorkspacePreparedSwitch = WorkspaceSwitchToken

export type WorkspacePrepareSwitchRequest = {
  session: WorkspaceSessionIdentity
}

export type WorkspaceCancelSwitchRequest = WorkspaceSwitchToken

export type WorkspaceCommitRootRequest = WorkspaceSwitchToken & {
  path: string | null
}

export type WorkspaceCommitSingleFileRequest = WorkspaceSwitchToken & {
  path: string
}

export type WorkspacePathActionRequest = {
  session: WorkspaceSessionIdentity
  path: string
}

export type WorkspacePathActionAck = {
  ok: true
}

export type WorkspaceGetSessionResult = WorkspaceResult<WorkspaceDescriptor>
export type WorkspaceReadFileResult = WorkspaceResult<WorkspaceReadFileResponse>
export type WorkspaceUpdateBufferResult = WorkspaceResult<WorkspaceUpdateBufferResponse>
export type WorkspaceFlushBuffersResult = WorkspaceResult<WorkspaceFlushBuffersAck>
export type WorkspacePrepareSwitchResult = WorkspaceResult<WorkspacePreparedSwitch>
export type WorkspaceCommitResult = WorkspaceResult<WorkspaceDescriptor>
export type WorkspaceCancelSwitchResult = WorkspaceResult<WorkspaceSwitchToken>
export type WorkspacePathActionResult = WorkspaceResult<WorkspacePathActionAck>

export type WorkspaceEntryKind = 'file' | 'folder'

export type WorkspaceSnapshotEntry = {
  path: string
  name: string
  kind: WorkspaceEntryKind
}

export type WorkspaceSnapshot = {
  root: WorkspaceRoot
  entries: WorkspaceSnapshotEntry[]
}

export type WorkspaceSnapshotChangedEvent = {
  session: WorkspaceSessionIdentity
  snapshot: WorkspaceSnapshot
}

export type WorkspaceSessionChangedEvent = WorkspaceDescriptor

export type WorkspaceSessionSeedEvent = WorkspaceDescriptor & {
  state?: Record<string, unknown>
  version?: number
}

export type WorkspaceLifecycleMessage = {
  request_id: string
  deadline: number
  reason: string
}

export type WorkspaceLifecycleRequest = WorkspaceLifecycleMessage
export type WorkspaceLifecycleAck = WorkspaceLifecycleMessage
export type WorkspacePrepareRequest = WorkspaceLifecycleRequest
export type WorkspacePrepareAck = WorkspaceLifecycleAck
export type WorkspaceSealRequest = WorkspaceLifecycleRequest
export type WorkspaceSealAck = WorkspaceLifecycleAck
export type WorkspacePrepareCancelledEvent = WorkspaceLifecycleMessage

export type AssetIssueCapabilityRequest = {
  path: string
}

export type AssetCapability = {
  url: string
  expires_at_ms: number
}

export type AssetReadBytesRequest = {
  asset_url: string
}

export type AssetBytes = {
  bytes: ArrayBuffer
  media_type?: string | null
  size_bytes: number
}

export type WorkspaceSessionApi = {
  getSession: () => Promise<WorkspaceGetSessionResult>
  readFile: (request: WorkspaceReadFileRequest) => Promise<WorkspaceReadFileResult>
  updateBuffer: (request: WorkspaceUpdateBufferRequest) => Promise<WorkspaceUpdateBufferResult>
  flushBuffers: (request: WorkspaceFlushBuffersRequest) => Promise<WorkspaceFlushBuffersResult>
  prepareSwitch: (request: WorkspacePrepareSwitchRequest) => Promise<WorkspacePrepareSwitchResult>
  commitRoot: (request: WorkspaceCommitRootRequest) => Promise<WorkspaceCommitResult>
  commitSingleFile: (request: WorkspaceCommitSingleFileRequest) => Promise<WorkspaceCommitResult>
  cancelSwitch: (request: WorkspaceCancelSwitchRequest) => Promise<WorkspaceCancelSwitchResult>
  openPathInSystem: (request: WorkspacePathActionRequest) => Promise<WorkspacePathActionResult>
  revealPathInSystem: (request: WorkspacePathActionRequest) => Promise<WorkspacePathActionResult>
  copyAbsolutePathToClipboard: (
    request: WorkspacePathActionRequest,
  ) => Promise<WorkspacePathActionResult>
  onSnapshotChanged: (handler: (event: WorkspaceSnapshotChangedEvent) => void) => () => void
  onBufferStatus: (handler: (event: WorkspaceBufferStatus) => void) => () => void
  onSessionChanged: (handler: (event: WorkspaceSessionChangedEvent) => void) => () => void
  onSessionSeed: (handler: (event: WorkspaceSessionSeedEvent) => void) => () => void
}

export type WorkspaceLifecycleApi = {
  workspaceReady: () => void
  onWorkspacePrepare: (handler: (request: WorkspacePrepareRequest) => void) => () => void
  ackWorkspacePrepare: (ack: WorkspacePrepareAck) => void
  onWorkspaceSeal: (handler: (request: WorkspaceSealRequest) => void) => () => void
  ackWorkspaceSeal: (ack: WorkspaceSealAck) => void
  onWorkspacePrepareCancelled: (
    handler: (event: WorkspacePrepareCancelledEvent) => void,
  ) => () => void
}

export type AssetApi = {
  issueCapability: (request: AssetIssueCapabilityRequest) => Promise<AssetCapability>
  readBytes: (request: AssetReadBytesRequest) => Promise<AssetBytes>
}
