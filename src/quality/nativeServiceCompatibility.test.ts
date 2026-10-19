import TauriService, { type TauriCapabilities } from '@wdio/tauri-service'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

// WDIO chooses its transport at module initialization, including service imports.
const previousNativeFetch = vi.hoisted(() => {
  const previous = process.env.WDIO_USE_NATIVE_FETCH
  process.env.WDIO_USE_NATIVE_FETCH = '1'
  return previous
})

afterAll(() => {
  if (previousNativeFetch === undefined) delete process.env.WDIO_USE_NATIVE_FETCH
  else process.env.WDIO_USE_NATIVE_FETCH = previousNativeFetch
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('official Tauri service with WebdriverIO 10', () => {
  it.each(['embedded', 'external'] as const)(
    'initializes the %s provider and preserves async results and failures',
    async (driverProvider) => {
      const transport = vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input)
        return new Response(
          JSON.stringify({ value: url.endsWith('/window/handles') ? ['main'] : 'main' }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        )
      })
      vi.stubGlobal('fetch', transport)
      const { attach } = await import('webdriverio')
      // Use WDIO's real command registry. Its context lookup uses the mocked
      // transport; no driver, server or application runs.
      const native = await attach({
        sessionId: `compatibility-${driverProvider}`,
        capabilities: { browserName: 'tauri' },
        hostname: '127.0.0.1',
        port: 1,
        options: { logLevel: 'silent', connectionRetryCount: 0 },
      })
      const execute = vi.fn(async (script: unknown, ...args: unknown[]) => {
        // Evaluate the official service's generated script locally.
        const callable = typeof script === 'function' ? script : new Function(String(script))
        return Reflect.apply(callable, undefined, args)
      })
      Object.defineProperty(native, 'execute', { configurable: true, value: execute })
      const overwriteCommand = vi.spyOn(native, 'overwriteCommand')
      const capabilities: TauriCapabilities = {
        browserName: 'tauri',
        'tauri:options': { application: 'unused' },
      }
      const service = new TauriService({ driverProvider }, capabilities)

      await service.before(capabilities, [], native)

      expect(native).not.toHaveProperty('executeAsync')
      expect(native).toHaveProperty('tauri.execute')
      expect(overwriteCommand.mock.calls.map(([name]) => name)).toEqual([
        'click',
        'doubleClick',
        'setValue',
        'clearValue',
      ])
      for (const [, , options] of overwriteCommand.mock.calls)
        expect(options).toEqual({ attachToElement: true })
      await expect(native.execute(async (value: number) => value + 1, 41)).resolves.toBe(42)
      await expect(
        native.execute(async () => {
          throw new Error('native script failure')
        }),
      ).rejects.toThrow('native script failure')
      await expect(native.execute('return Promise.resolve(7)')).resolves.toBe(7)
      await expect(
        native.execute('return Promise.reject(new Error("native string failure"))'),
      ).rejects.toThrow('native string failure')
      expect(transport).toHaveBeenCalled()
    },
  )
})
