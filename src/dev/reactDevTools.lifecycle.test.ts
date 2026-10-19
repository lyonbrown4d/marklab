import { describe, expect, it, vi } from 'vitest'

const subprocess = vi.hoisted(() => ({
  launch: vi.fn(() =>
    Object.assign(Promise.resolve({ exitCode: 0 }), {
      stage: 'fulfilled',
      pid: 1,
      kill: vi.fn(),
    }),
  ),
}))
vi.mock('zx', () => ({ $: () => subprocess.launch }))
vi.mock('../../scripts/development-config', () => ({
  loadDevelopmentConfig: () => ({
    configuration: {
      enabled: true,
      host: '127.0.0.1',
      origin: 'http://127.0.0.1:8097',
      port: 8097,
      readinessTimeoutMs: 20_000,
    },
    environment: {},
  }),
  createDevelopmentCsp: (value: string) => value,
}))

describe('React DevTools startup cancellation', () => {
  it('does not launch either process when cancelled during the initial backend probe', async () => {
    const previousExitCode = process.exitCode
    let interrupt: (() => void) | undefined
    let probeStarted!: () => void
    const probe = new Promise<void>((resolve) => {
      probeStarted = resolve
    })
    const originalOnce = process.once.bind(process)
    vi.spyOn(process, 'once').mockImplementation((event, listener) => {
      if (event === 'SIGINT') {
        interrupt = listener as () => void
        return process
      }
      return originalOnce(event, listener)
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        probeStarted()
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          })
        })
      }),
    )
    try {
      const startup = import('../../scripts/dev-desktop')
      await probe
      expect(interrupt).toBeTypeOf('function')
      interrupt!()
      await startup
      expect(subprocess.launch).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(130)
    } finally {
      process.exitCode = previousExitCode
      vi.unstubAllGlobals()
    }
  })
})
