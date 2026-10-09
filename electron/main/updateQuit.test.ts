import { describe, expect, it, vi } from 'vitest'
import { continueAppQuit } from '@electron/main/updateQuit'

describe('continueAppQuit', () => {
  it('lets the updater own quit after the normal shutdown barrier completes', () => {
    const order: string[] = []
    let failHandoff: (() => void) | undefined
    const app = { quit: vi.fn() }
    const updates = {
      dispose: vi.fn(() => order.push('dispose')),
      quitAndInstallIfScheduled: vi.fn((onFailure?: () => void) => {
        order.push('install')
        failHandoff = onFailure
        return true
      }),
    }

    continueAppQuit(app, updates)

    expect(updates.quitAndInstallIfScheduled).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
    expect(updates.dispose).not.toHaveBeenCalled()
    expect(order).toEqual(['install'])

    failHandoff?.()
    failHandoff?.()
    expect(app.quit).toHaveBeenCalledOnce()
    expect(updates.dispose).toHaveBeenCalledOnce()
  })

  it('continues a normal quit when no update is scheduled or installer launch fails', () => {
    const app = { quit: vi.fn() }
    const updates = {
      dispose: vi.fn(),
      quitAndInstallIfScheduled: vi.fn(() => false),
    }

    continueAppQuit(app, updates)

    expect(app.quit).toHaveBeenCalledOnce()
    expect(updates.dispose).toHaveBeenCalledOnce()
  })
})
