import { describe, expect, it, vi } from 'vitest'

import { applyWindowUpdateProgress } from '@electron/services/nativeUpdateProgress.js'
import type { UpdateEventPayload } from '@electron/types.js'

const update = (overrides: Partial<UpdateEventPayload>): UpdateEventPayload => ({
  event: 'checking',
  status: 'checking',
  ...overrides,
})

describe('native update progress', () => {
  it('uses indeterminate native progress while checking', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowUpdateProgress(window, update({ event: 'checking', status: 'checking' }))

    expect(window.setProgressBar).toHaveBeenCalledWith(2, { mode: 'indeterminate' })
  })

  it('maps download percent to determinate native progress', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowUpdateProgress(
      window,
      update({
        event: 'download-progress',
        progress: { bytesPerSecond: 1, percent: 45, total: 100, transferred: 45 },
        status: 'downloading',
      }),
    )

    expect(window.setProgressBar).toHaveBeenCalledWith(0.45)
  })

  it('uses indeterminate native progress for downloads without percent', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowUpdateProgress(
      window,
      update({ event: 'download-progress', progress: undefined, status: 'downloading' }),
    )

    expect(window.setProgressBar).toHaveBeenCalledWith(2, { mode: 'indeterminate' })
  })

  it('clears native progress for terminal non-error states', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowUpdateProgress(window, update({ event: 'downloaded', status: 'downloaded' }))

    expect(window.setProgressBar).toHaveBeenCalledWith(-1)
  })

  it('shows native error progress on update errors', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowUpdateProgress(window, update({ event: 'error', status: 'error' }))

    expect(window.setProgressBar).toHaveBeenCalledWith(1, { mode: 'error' })
  })

  it('does not touch destroyed windows', () => {
    const window = {
      isDestroyed: () => true,
      setProgressBar: vi.fn(),
    }

    applyWindowUpdateProgress(window, update({ event: 'checking', status: 'checking' }))

    expect(window.setProgressBar).not.toHaveBeenCalled()
  })
})
