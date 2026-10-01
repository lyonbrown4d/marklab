import { describe, expect, it } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'

describe('native IPC channels', () => {
  it('defines a dedicated AI inline completion surface', () => {
    expect(nativeIpcChannels.aiCompletionStart).toBe('marklab:ai-completion:start')
    expect(nativeIpcChannels.aiCompletionCancel).toBe('marklab:ai-completion:cancel')
    expect(nativeIpcChannels.aiCompletionEvent).toBe('marklab:ai-completion:event')
  })

  it('defines dedicated workspace path channels', () => {
    expect(nativeIpcChannels.workspaceOpenPathInSystem).toBe(
      'marklab:workspace:open-path-in-system',
    )
    expect(nativeIpcChannels.workspaceRevealPathInSystem).toBe(
      'marklab:workspace:reveal-path-in-system',
    )
    expect(nativeIpcChannels.workspaceCopyAbsolutePath).toBe('marklab:workspace:copy-absolute-path')
  })

  it('does not advertise the unimplemented workspace session protocol', () => {
    expect(nativeIpcChannels).not.toHaveProperty('workspaceGetSession')
    expect(nativeIpcChannels).not.toHaveProperty('workspacePrepareSwitch')
    expect(nativeIpcChannels).not.toHaveProperty('workspaceCommitRoot')
  })
})
