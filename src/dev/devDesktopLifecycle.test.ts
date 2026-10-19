import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Child = Promise<{ exitCode: number }> & {
  stage: string
  pid: number
  kill: (signal: string) => Promise<void>
  timeout: (duration: string, signal: string) => Child
}

const harness = vi.hoisted(() => ({
  enabled: true,
  execute: vi.fn<(command: string) => Child>(),
  signals: [] as string[],
}))

vi.mock('zx', () => ({
  $: () => (pieces: TemplateStringsArray) => harness.execute(pieces.join('')),
}))
vi.mock('../../scripts/development-config.ts', () => ({
  loadDevelopmentConfig: () => ({
    configuration: {
      enabled: harness.enabled,
      origin: 'http://127.0.0.1:8097',
      host: '127.0.0.1',
      port: 8097,
      readinessTimeoutMs: 1_000,
    },
    environment: {},
  }),
  createDevelopmentCsp: (csp: string) => csp,
}))
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readFile: async () => JSON.stringify({ app: { security: { csp: "script-src 'self'" } } }),
}))

const child = (exitCode?: number): Child => {
  let finish: (code: number) => void = () => undefined
  const completion = new Promise<{ exitCode: number }>((resolve) => {
    finish = (code) => resolve({ exitCode: code })
  })
  const result: Child = Object.assign(completion, {
    stage: exitCode === undefined ? 'running' : 'fulfilled',
    pid: 1234,
    kill: async (signal: string) => {
      harness.signals.push(signal)
    },
    timeout: (duration: string, signal: string) => {
      harness.signals.push(`${duration}:${signal}`)
      queueMicrotask(() => {
        result.stage = 'fulfilled'
        finish(0)
      })
      return result
    },
  })
  if (exitCode !== undefined) finish(exitCode)
  return result
}

const ready = () => ({ ok: true, text: async () => 'ReactDevToolsBackend' })
const run = () => import('../../scripts/dev-desktop.ts')
let previousExitCode: typeof process.exitCode

describe('desktop development child lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    harness.enabled = true
    harness.signals = []
    previousExitCode = process.exitCode
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    process.exitCode = previousExitCode
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('delegates graceful termination and bounded forced cleanup to zx for owned tools', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new Error('Not ready')).mockResolvedValue(ready()),
    )
    harness.execute.mockImplementation((command) =>
      command.includes('react-devtools') ? child() : child(7),
    )
    await run()
    expect(harness.execute).toHaveBeenCalledTimes(2)
    expect(harness.signals).toEqual(['SIGTERM', '2s:SIGKILL'])
    expect(process.exitCode).toBe(7)
  })

  it('reuses external DevTools without creating or terminating an owned tool process', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ready()))
    harness.execute.mockReturnValue(child(0))
    await run()
    expect(harness.execute).toHaveBeenCalledTimes(1)
    expect(harness.execute.mock.calls[0]?.[0]).toContain('pnpm exec tauri dev')
    expect(harness.signals).toEqual([])
    expect(process.exitCode).toBe(0)
  })

  it('starts only the desktop when DevTools are disabled and preserves failure exit codes', async () => {
    harness.enabled = false
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    harness.execute.mockReturnValue(child(4))
    await run()
    expect(fetch).not.toHaveBeenCalled()
    expect(harness.execute).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(4)
  })

  it('does not start a child after interruption during initial readiness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        process.emit('SIGTERM')
        throw new Error('Interrupted')
      }),
    )
    await run()
    expect(harness.execute).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(143)
  })
})
