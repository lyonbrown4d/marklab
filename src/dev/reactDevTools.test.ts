import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- Verify the Node development boundary without launching tools.
import {
  createDevelopmentCsp,
  loadDevelopmentConfig,
  parseDevelopmentConfig,
} from '../../scripts/development-config'
// eslint-disable-next-line no-restricted-imports -- Verify Vite's development-only HTML integration.
import { reactDevToolsPlugin } from '../../vite.reactDevTools'

describe('React DevTools development integration', () => {
  it('enables the local official tool by default and accepts an opt-out', () => {
    expect(parseDevelopmentConfig({})).toMatchObject({
      enabled: true,
      origin: 'http://127.0.0.1:8097',
    })
    expect(parseDevelopmentConfig({ MARKLAB_REACT_DEVTOOLS: 'false' }).enabled).toBe(false)
    expect(parseDevelopmentConfig({ VITE_REACT_DEVTOOLS: 'false' }).enabled).toBe(false)
  })

  it('rejects malformed flags, ports, and readiness limits before starting processes', () => {
    expect(() => parseDevelopmentConfig({ MARKLAB_REACT_DEVTOOLS: 'maybe' })).toThrow()
    expect(() => parseDevelopmentConfig({ MARKLAB_REACT_DEVTOOLS_PORT: '65536' })).toThrow()
    expect(() => parseDevelopmentConfig({ MARKLAB_REACT_DEVTOOLS_TIMEOUT_MS: '0' })).toThrow()
  })

  it('lets explicit process configuration override dotenv values', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'marklab-dev-config-'))
    try {
      await writeFile(
        path.join(directory, '.env.local'),
        'MARKLAB_REACT_DEVTOOLS=false\nMARKLAB_REACT_DEVTOOLS_PORT=8098\n',
      )
      vi.stubEnv('MARKLAB_REACT_DEVTOOLS_PORT', '8099')
      vi.stubEnv('MARKLAB_REACT_DEVTOOLS', undefined)
      expect(loadDevelopmentConfig('tauri', directory).configuration).toMatchObject({
        enabled: false,
        port: 8099,
      })
    } finally {
      vi.unstubAllEnvs()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('prepends a blocking backend script before the React module in development only', async () => {
    const plugin = reactDevToolsPlugin(parseDevelopmentConfig({}))
    const hook = plugin.transformIndexHtml
    if (!hook || typeof hook === 'function' || !('handler' in hook))
      throw new Error('Missing HTML hook')
    expect(plugin.apply).toBe('serve')
    expect(hook.order).toBe('pre')
    expect(await hook.handler()).toEqual([
      { tag: 'script', attrs: { src: 'http://127.0.0.1:8097' }, injectTo: 'head-prepend' },
    ])
    const disabled = reactDevToolsPlugin(
      parseDevelopmentConfig({ MARKLAB_REACT_DEVTOOLS: 'false' }),
    ).transformIndexHtml
    if (!disabled || typeof disabled === 'function' || !('handler' in disabled))
      throw new Error('Missing HTML hook')
    expect(await disabled.handler()).toEqual([])
  })

  it('derives only a development CSP override and preserves the production policy', () => {
    const production =
      "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'"
    expect(createDevelopmentCsp(production, parseDevelopmentConfig({}))).toBe(
      "default-src 'self'; script-src 'self' http://127.0.0.1:8097; connect-src 'self' ws://127.0.0.1:8097; object-src 'none'",
    )
    expect(
      createDevelopmentCsp(production, parseDevelopmentConfig({ MARKLAB_REACT_DEVTOOLS: 'false' })),
    ).toBe(production)
    expect(() => createDevelopmentCsp("default-src 'self'", parseDevelopmentConfig({}))).toThrow(
      'explicit script-src',
    )
  })
})
