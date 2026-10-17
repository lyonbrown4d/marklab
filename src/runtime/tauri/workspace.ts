import type { DesktopRuntimeApi } from '@/runtime/desktop'
import type { WorkspaceSyncApi } from '@/runtime/workspaceSync'
import { request, type TauriEventHub } from '@/runtime/tauri/transport'

type WorkspaceSurfaces = Pick<DesktopRuntimeApi, 'assets' | 'workspace' | 'workspaceTree'>

export const createWorkspaceApis = (events: TauriEventHub): WorkspaceSurfaces => ({
  assets: { issueCapability: (payload) => request('assets_issue_capability', payload) },
  workspace: {
    copyAbsolutePathToClipboard: (path) => request('workspace_copy_absolute_path', { path }),
    openPathInSystem: (path) => request('workspace_open_path_in_system', { path }),
    readTextPreview: (path, limitBytes) =>
      request('workspace_read_text_preview', { path, limit_bytes: limitBytes }),
    revealPathInSystem: (path) => request('workspace_reveal_path_in_system', { path }),
  },
  workspaceTree: {
    initialFile: () => request('workspace_tree_initial_file'),
    listChildren: (payload) => request('workspace_tree_list_children', payload),
    pathsExist: (payload) => request('workspace_tree_paths_exist', payload),
    search: (payload) => request('workspace_tree_search', payload),
    onChanged: (handler) => events.on('workspace-tree-changed', handler),
  },
})

export const createWorkspaceSyncApi = (events: TauriEventHub): WorkspaceSyncApi => ({
  conflicts: {
    list: (rootPath) => request('sync_conflicts_list', { rootPath }),
    read: (payload) => request('sync_conflicts_read', payload),
    resolve: (payload) => request('sync_conflicts_resolve', payload),
  },
  channels: {
    get: () => request('sync_channels_get'),
    remove: () => request('sync_channels_remove'),
    set: (payload) => request('sync_channels_set', payload),
  },
  cancel: (requestId) => request('sync_cancel', { requestId }),
  onProgress: (handler) => events.on('sync-progress', handler),
  start: (requestId) => request('sync_start', { requestId }),
  webDavProfiles: {
    delete: (id) => request('webdav_profile_delete', { id }),
    list: () => request('webdav_profile_list'),
    test: (id) => request('webdav_profile_test', { id }),
    update: (payload) => request('webdav_profile_update', payload),
  },
})
