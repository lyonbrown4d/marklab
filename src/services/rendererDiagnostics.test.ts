import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createRendererDiagnosticReporter,
  installRendererDiagnostics,
  normalizeDiagnosticError,
} from '@/services/rendererDiagnostics'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('renderer diagnostics', () => {
  it('normalizes Error values without copying arbitrary properties', () => {
    const error = new Error('broken') as Error & { token?: string }
    error.name = 'RangeError'
    error.token = 'secret'

    expect(normalizeDiagnosticError(error)).toEqual({
      message: 'broken',
      name: 'RangeError',
      stack: error.stack,
    })
  })

  it('deduplicates identical reports during the cooldown window', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true })
    const report = createRendererDiagnosticReporter({ invoke, now: () => 1_000 })

    report.error('app.runtime', 'unhandled-error', new Error('boom'))
    report.error('app.runtime', 'unhandled-error', new Error('boom'))
    await Promise.resolve()

    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith(
      'diagnostics_renderer_report',
      expect.objectContaining({ event: 'unhandled-error', level: 'error', scope: 'app.runtime' }),
    )
  })

  it('never throws when the diagnostics bridge is unavailable', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('bridge closed'))
    const report = createRendererDiagnosticReporter({ invoke })

    expect(() => report.warn('editor', 'recoverable-error', new Error('oops'))).not.toThrow()
    await Promise.resolve()
  })

  it('survives poisoned Error properties and a synchronous bridge failure', async () => {
    const invoke = vi.fn(() => {
      throw new Error('bridge closed')
    })
    const error = new Error('broken')
    Object.defineProperty(error, 'message', {
      get: () => {
        throw new Error('poisoned getter')
      },
    })
    const report = createRendererDiagnosticReporter({ invoke })

    expect(() => report.error('app.runtime', 'unhandled-error', error)).not.toThrow()
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('installs and removes global error listeners through an injected reporter', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const reporter = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }
    const cleanup = installRendererDiagnostics(reporter)
    const renderError = new ErrorEvent('error', {
      cancelable: true,
      error: new Error('render failed'),
    })
    renderError.preventDefault()
    window.dispatchEvent(renderError)
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(rejection, 'reason', { value: new Error('async failed') })
    window.dispatchEvent(rejection)

    expect(reporter.info).toHaveBeenCalledWith('app.lifecycle', 'renderer-started')
    expect(reporter.error).toHaveBeenCalledTimes(2)
    cleanup()
    expect(removeEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function))
  })
})
