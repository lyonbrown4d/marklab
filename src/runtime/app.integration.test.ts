import { describe, expect, it, vi } from 'vitest'

import { dispatchMenuAction } from '@/runtime/app'
import { onMenuActionRequest } from '@/utils/appEvents'

vi.mock('@/runtime/desktop', () => ({
  getDesktopRuntime: () => {
    throw new Error('Desktop API requested in browser')
  },
  isDesktopRuntime: () => false,
}))

describe('runtime app integration', () => {
  it('routes menu actions through the renderer event bus in browser previews', async () => {
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
