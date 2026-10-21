import type {
  DesktopCommandArgs,
  DesktopCommandName,
  DesktopCommandResults,
  DesktopEventPayloads,
} from '@/generated/desktop/bindings'

// Legacy service names remain aliases at this boundary while Rust owns the wire contract.
export const commandAliases = {
  'app-ready': 'app_ready',
  'knowledge.engine.status': 'knowledge_engine_status',
  'knowledge.engine.initialize': 'knowledge_engine_initialize',
  'knowledge.engine.stop': 'knowledge_engine_stop',
  'knowledge.engine.workspaceStatus': 'knowledge_engine_workspace_status',
  'knowledge.engine.workspaces': 'knowledge_engine_workspaces',
} as const satisfies Record<string, DesktopCommandName>

type CommandAliases = typeof commandAliases
export type RuntimeCommandName = DesktopCommandName | keyof CommandAliases
export type NativeCommandName<C extends RuntimeCommandName> = C extends keyof CommandAliases
  ? CommandAliases[C]
  : Extract<C, DesktopCommandName>
export type NativeCommandRequest<C extends DesktopCommandName> = DesktopCommandArgs[C] extends {
  request: infer Request
}
  ? Request
  : never
export type RuntimeCommandPayload<C extends RuntimeCommandName> =
  C extends 'fs_import_markdown_asset_bytes'
    ? Omit<NativeCommandRequest<C>, 'bytes'> & { bytes: ArrayBuffer | Uint8Array }
    : NativeCommandRequest<NativeCommandName<C>>
export type RuntimeCommandResult<C extends RuntimeCommandName> =
  DesktopCommandResults[NativeCommandName<C>]
export type RuntimeCommandParameters<C extends RuntimeCommandName> =
  Record<string, never> extends RuntimeCommandPayload<C>
    ? [payload?: RuntimeCommandPayload<C>]
    : [payload: RuntimeCommandPayload<C>]

export type RuntimeEventName = keyof DesktopEventPayloads | 'app-ready'
// The hub consumes native routing metadata before forwarding payloads to domain listeners.
export type RuntimeEventPayloads = Omit<DesktopEventPayloads, 'workspace-session-seed'> & {
  'workspace-session-seed': Omit<
    DesktopEventPayloads['workspace-session-seed'],
    'nativeAttempt' | 'nativeGeneration'
  >
  // Browser previews use the same readiness DTO for their local lifecycle signal.
  'app-ready': NativeCommandRequest<'app_ready'>
}
