import { invoke } from '@/runtime/ipc'
import type { NativeCommandRequest, RuntimeCommandResult } from '@/runtime/tauri/contract'

export type WorkspaceLayoutInput = NativeCommandRequest<'fs_set_workspace_layout'>['layout']
export type WorkspaceLayout = NonNullable<RuntimeCommandResult<'fs_get_workspace_layout'>['layout']>

export const workspaceLayoutApi = {
  get: (workspaceKey: string) => invoke('fs_get_workspace_layout', { workspace_key: workspaceKey }),
  set: async (workspaceKey: string, sessionGeneration: number, layout: WorkspaceLayoutInput) => {
    const result = await invoke('fs_set_workspace_layout', {
      workspace_key: workspaceKey,
      session_generation: sessionGeneration,
      layout,
    })
    if (!result.saved) throw new Error('Workspace layout was not saved')
    return result
  },
}
