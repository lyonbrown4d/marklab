import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { createWindowPoolReadiness } from '@electron/windowPoolReadiness'

const window = {} as BrowserWindow

describe('window pool renderer readiness', () => {
  it('rejects a stalled renderer after the configured interactive timeout', async () => {
    let expire!: () => void
    const scheduleTimeout = vi.fn((callback: () => void) => {
      expire = callback
      return 1
    })
    const readiness = createWindowPoolReadiness({
      interactiveTimeoutMs: 25,
      scheduleTimeout,
    })

    const interactive = readiness.waitForInteractive(window)
    expire()

    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 25)
    await expect(interactive).rejects.toThrow('Renderer did not become interactive within 25ms.')
  })

  it('clears the timeout when the renderer becomes interactive', async () => {
    const timeoutHandle = { id: 1 }
    const scheduleTimeout = vi.fn(() => timeoutHandle)
    const cancelTimeout = vi.fn()
    const readiness = createWindowPoolReadiness({ cancelTimeout, scheduleTimeout })

    const interactive = readiness.waitForInteractive(window)
    readiness.markInteractive(window)

    await expect(interactive).resolves.toBeUndefined()
    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 60_000)
    expect(cancelTimeout).toHaveBeenCalledWith(timeoutHandle)
  })
})
