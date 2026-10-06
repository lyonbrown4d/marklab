import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { createEditCommandsPreloadSurface } from '@electron/preload/editCommands'

describe('focused edit command preload surface', () => {
  it('uses the named edit command channel', async () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    const surface = createEditCommandsPreloadSurface({ invoke })

    await expect(surface.execute('copy')).resolves.toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.editCommand, { action: 'copy' })
  })
})
