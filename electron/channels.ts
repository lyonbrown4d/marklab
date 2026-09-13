export const nativeIpcChannels = {
  appReadyIsReady: 'marklab:app-ready:is-ready',
  appReadySignal: 'marklab:app-ready',
  appReadyWhenReady: 'marklab:app-ready:when-ready',
  assetsIssueCapability: 'marklab:assets:issue-capability',
  assetsReadBytes: 'marklab:assets:read-bytes',
  clipboardReadImage: 'marklab:clipboard:read-image',
  clipboardReadText: 'marklab:clipboard:read-text',
  clipboardWriteText: 'marklab:clipboard:write-text',
  commandInvoke: 'marklab:command:invoke',
  dialogOpen: 'marklab:dialog:open',
  dialogSave: 'marklab:dialog:save',
  lifecycleGetLaunchInfo: 'marklab:lifecycle:get-launch-info',
  lifecycleWorkspaceReady: 'marklab:lifecycle:workspace-ready',
  lifecycleWorkspacePrepare: 'marklab:lifecycle:workspace-prepare',
  lifecycleAckWorkspacePrepare: 'marklab:lifecycle:ack-workspace-prepare',
  lifecycleWorkspaceSeal: 'marklab:lifecycle:workspace-seal',
  lifecycleAckWorkspaceSeal: 'marklab:lifecycle:ack-workspace-seal',
  lifecycleWorkspacePrepareCancelled: 'marklab:lifecycle:workspace-prepare-cancelled',
  menuCommand: 'marklab:menu:command',
  menuRendererReady: 'marklab:menu:renderer-ready',
  platformGet: 'marklab:platform:get',
  settingsPersistGet: 'marklab:settings:persist:get',
  settingsPersistRemove: 'marklab:settings:persist:remove',
  settingsPersistSet: 'marklab:settings:persist:set',
  shellOpenPath: 'marklab:shell:open-path',
  shellRevealPath: 'marklab:shell:reveal-path',
  themeImportCss: 'marklab:theme:import-css',
  themeList: 'marklab:theme:list',
  themeOpenFolder: 'marklab:theme:open-folder',
  themeReadCss: 'marklab:theme:read-css',
  themeRemove: 'marklab:theme:remove',
  updatesCheck: 'marklab:updates:check',
  updatesDownload: 'marklab:updates:download',
  updatesEvent: 'marklab:updates:event',
  updatesGetState: 'marklab:updates:get-state',
  updatesInstall: 'marklab:updates:install',
  windowClose: 'marklab:window:close',
  windowIsMaximized: 'marklab:window:is-maximized',
  windowMaximize: 'marklab:window:maximize',
  windowMinimize: 'marklab:window:minimize',
  windowStartDrag: 'marklab:window:start-drag',
  windowUnmaximize: 'marklab:window:unmaximize',
  workspaceGetSession: 'marklab:workspace:get-session',
  workspaceReadFile: 'marklab:workspace:read-file',
  workspaceUpdateBuffer: 'marklab:workspace:update-buffer',
  workspaceFlushBuffers: 'marklab:workspace:flush-buffers',
  workspacePrepareSwitch: 'marklab:workspace:prepare-switch',
  workspaceCommitRoot: 'marklab:workspace:commit-root',
  workspaceCommitSingleFile: 'marklab:workspace:commit-single-file',
  workspaceCancelSwitch: 'marklab:workspace:cancel-switch',
  workspaceSnapshotChanged: 'marklab:workspace:snapshot-changed',
  workspaceBufferStatus: 'marklab:workspace:buffer-status',
  workspaceSessionChanged: 'marklab:workspace:session-changed',
  workspaceSessionSeed: 'marklab:workspace:session-seed',
} as const

/**
 * @deprecated Transitional command IDs for named preload methods backed by the legacy command bridge.
 */
export const transitionalNativeCommands = {
  workspaceGetSession: 'workspace_get_session',
  workspaceReadFile: 'workspace_read_file',
  workspaceUpdateBuffer: 'workspace_update_buffer',
  workspaceFlushBuffers: 'workspace_flush_buffers',
  workspacePrepareSwitch: 'workspace_prepare_switch',
  workspaceCommitRoot: 'workspace_commit_root',
  workspaceCommitSingleFile: 'workspace_commit_single_file',
  workspaceCancelSwitch: 'workspace_cancel_switch',
  assetsIssueCapability: 'fs_issue_asset_capability',
  assetsReadBytes: 'fs_read_asset_bytes',
} as const

export type NativeIpcChannel = (typeof nativeIpcChannels)[keyof typeof nativeIpcChannels]

/**
 * @deprecated Use a named preload method and its dedicated IPC channel.
 */
export type TransitionalNativeCommand =
  (typeof transitionalNativeCommands)[keyof typeof transitionalNativeCommands]
