import { describe, expect, it, vi } from 'vitest'

import { dispatchMenuAction } from '@/runtime/app'
import { onMenuActionRequest } from '@/utils/appEvents'

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => null,
}))

describe('runtime app integration', () => {
  it('routes menu actions through the renderer event bus outside Electron', async () => {
    const events: string[] = []
    const unsubscribe = onMenuActionRequest((id) => {
      events.push(id)
    })

    await expect(dispatchMenuAction('settings.open')).resolves.toEqual({ ok: true })
    unsubscribe()
    await dispatchMenuAction('settings.open-again')

    expect(events).toEqual(['settings.open'])
  })
})
