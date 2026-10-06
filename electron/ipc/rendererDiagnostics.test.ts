import { describe, expect, it, vi } from 'vitest'

import { createRendererDiagnosticsHandler } from '@electron/ipc/rendererDiagnostics'
import type { Logger } from '@electron/services/logger'

const createLogger = (): Logger => {
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  logger.child.mockReturnValue(logger)
  return logger
}

describe('renderer diagnostics IPC', () => {
  it('records a validated renderer error with the sender identity', () => {
    const logger = createLogger()
    const handler = createRendererDiagnosticsHandler(logger)

    expect(
      handler(
        {
          level: 'error',
          scope: 'app.runtime',
          event: 'unhandled-error',
          message: 'render failed',
          error: { name: 'TypeError', message: 'boom', stack: 'stack' },
        },
        { sender: { id: 7 } } as never,
      ),
    ).toEqual({ ok: true })
    expect(logger.error).toHaveBeenCalledWith('unhandled-error', {
      error: { message: 'boom', name: 'TypeError', stack: 'stack' },
      message: 'render failed',
      rendererId: 7,
    })
  })

  it('rejects unknown levels and unsafe scope names', () => {
    const handler = createRendererDiagnosticsHandler(createLogger())

    expect(() =>
      handler({ level: 'trace', scope: 'app', event: 'failed' }, { sender: { id: 1 } } as never),
    ).toThrow('Invalid renderer diagnostic report')
    expect(() =>
      handler({ level: 'error', scope: '../secrets', event: 'failed' }, {
        sender: { id: 1 },
      } as never),
    ).toThrow('Invalid renderer diagnostic report')
  })

  it('rate limits a noisy renderer', () => {
    const logger = createLogger()
    const handler = createRendererDiagnosticsHandler(logger, { maxReportsPerMinute: 2 })
    const event = { sender: { id: 3 } } as never
    const report = { level: 'warn', scope: 'editor', event: 'recoverable-error' }

    handler(report, event)
    handler(report, event)
    expect(handler(report, event)).toEqual({ ok: false, reason: 'rate-limited' })
    expect(logger.warn).toHaveBeenCalledTimes(3)
    expect(logger.warn).toHaveBeenLastCalledWith('renderer diagnostics rate limited', {
      rendererId: 3,
    })
  })

  it('rate limits invalid payloads before parsing them', () => {
    const logger = createLogger()
    const handler = createRendererDiagnosticsHandler(logger, { maxReportsPerMinute: 2 })
    const event = { sender: { id: 4 } } as never

    expect(() => handler({ level: 'trace' }, event)).toThrow('Invalid renderer diagnostic report')
    expect(() => handler({ level: 'trace' }, event)).toThrow('Invalid renderer diagnostic report')
    expect(handler({ level: 'trace' }, event)).toEqual({ ok: false, reason: 'rate-limited' })
    expect(logger.warn).toHaveBeenCalledWith('renderer diagnostics rate limited', {
      rendererId: 4,
    })
  })
})
