import { describe, expect, it } from 'vitest'
import { allowedCommands } from '@electron/preload/allowlists'

describe('workspace buffer patch IPC boundary', () => {
  it('exposes the bounded patch command and removes the legacy snapshot command', () => {
    expect(allowedCommands.has('fs_apply_buffer_update')).toBe(true)
    expect(allowedCommands.has('fs_update_buffer')).toBe(false)
  })
})
