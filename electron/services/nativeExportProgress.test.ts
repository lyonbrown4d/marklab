import { describe, expect, it, vi } from 'vitest'

import { applyWindowExportProgress } from '@electron/services/nativeExportProgress.js'
import type { ExportTaskPayload } from '@electron/types.js'

const task = (overrides: Partial<ExportTaskPayload>): ExportTaskPayload => ({
  format: 'pdf',
  id: 'export-1',
  output_path: '/tmp/export.pdf',
  status: 'started',
  ...overrides,
})

describe('native export progress', () => {
  it('maps started export progress to determinate native progress', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowExportProgress(window, task({ progress: 0.35 }))

    expect(window.setProgressBar).toHaveBeenCalledWith(0.35)
  })

  it('clamps export progress into the native progress range', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowExportProgress(window, task({ progress: 1.5 }))

    expect(window.setProgressBar).toHaveBeenCalledWith(1)
  })

  it('uses indeterminate native progress when started progress is unavailable', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowExportProgress(window, task({ progress: null }))

    expect(window.setProgressBar).toHaveBeenCalledWith(2, { mode: 'indeterminate' })
  })

  it('clears native progress when export finishes', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowExportProgress(window, task({ status: 'finished', progress: 1 }))

    expect(window.setProgressBar).toHaveBeenCalledWith(-1)
  })

  it('shows native error progress when export fails', () => {
    const window = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    }

    applyWindowExportProgress(window, task({ status: 'failed', progress: null }))

    expect(window.setProgressBar).toHaveBeenCalledWith(1, { mode: 'error' })
  })

  it('does not touch destroyed windows', () => {
    const window = {
      isDestroyed: () => true,
      setProgressBar: vi.fn(),
    }

    applyWindowExportProgress(window, task({ progress: 0.5 }))

    expect(window.setProgressBar).not.toHaveBeenCalled()
  })
})
