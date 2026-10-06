import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronLog = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  errorHandler: { startCatching: vi.fn() },
  info: vi.fn(),
  transports: {
    console: { level: 'info' },
    file: { fileName: '', level: 'info', maxSize: 0 },
  },
  warn: vi.fn(),
}))

vi.mock('electron-log/main', () => ({ default: electronLog }))

import { createElectronLogger } from '@electron/services/logger'

describe('Electron logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redacts sensitive nested fields and safely handles circular values', () => {
    const circular: Record<string, unknown> = { label: 'context' }
    circular.self = circular
    const logger = createElectronLogger({ isPackaged: true })

    logger.error('request failed', {
      authorization: 'Bearer secret',
      nested: { apiKey: 'top-secret', circular },
    })

    expect(electronLog.error).toHaveBeenCalledWith('[request failed]'.replace(/\[|\]/g, ''), {
      authorization: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        circular: { label: 'context', self: '[Circular]' },
      },
    })
  })

  it('bounds file log growth and oversized string fields', () => {
    const logger = createElectronLogger({ isPackaged: false })

    logger.info('payload received', { value: 'x'.repeat(700) })

    expect(electronLog.transports.file.maxSize).toBe(5 * 1024 * 1024)
    expect(electronLog.info).toHaveBeenCalledWith('payload received', {
      value: `${'x'.repeat(497)}...`,
    })
  })

  it('redacts secrets embedded in error text and uncommon credential fields', () => {
    const logger = createElectronLogger({ isPackaged: true })
    const error = new Error(
      'Authorization: Bearer abc.def https://user:pass@example.com/path?token=secret#section',
    )

    logger.error('provider failed', {
      clientKey: 'client-secret',
      privateKey: 'private-secret',
      error,
    })

    const fields = electronLog.error.mock.calls[0]?.[1]
    expect(fields).toMatchObject({ clientKey: '[REDACTED]', privateKey: '[REDACTED]' })
    expect(JSON.stringify(fields)).not.toContain('abc.def')
    expect(JSON.stringify(fields)).not.toContain('user:pass')
    expect(JSON.stringify(fields)).not.toContain('token=secret')
  })

  it('applies a global traversal budget to wide nested fields', () => {
    const logger = createElectronLogger({ isPackaged: true })
    const branches = Array.from({ length: 50 }, (_, branch) => ({
      branch,
      values: Array.from({ length: 50 }, (_, value) => `${branch}-${value}-${'x'.repeat(200)}`),
    }))

    logger.info('large context', { branches })

    const serialized = JSON.stringify(electronLog.info.mock.calls[0]?.[1])
    expect(serialized.length).toBeLessThan(70_000)
    expect(serialized).toContain('[Truncated]')
  })

  it('never throws when diagnostic context contains a hostile proxy', () => {
    const logger = createElectronLogger({ isPackaged: true })
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('blocked')
        },
      },
    )

    expect(() => logger.error('hostile context', { hostile })).not.toThrow()
    expect(electronLog.error).toHaveBeenCalledWith('hostile context', {
      diagnostics: '[Unavailable]',
    })
  })

  it('includes field names in the global log budget', () => {
    const logger = createElectronLogger({ isPackaged: true })
    const longKeyFields = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [`${index}-${'k'.repeat(100_000)}`, index]),
    )

    logger.info('long keys', { longKeyFields })

    const serialized = JSON.stringify(electronLog.info.mock.calls[0]?.[1])
    expect(serialized.length).toBeLessThan(64 * 1024)
    expect(serialized).toContain('[Truncated]')
  })

  it('redacts credential key variants, quoted secrets, and PEM blocks', () => {
    const logger = createElectronLogger({ isPackaged: true })
    logger.error('credentials rejected', {
      accessKeyId: 'access-id',
      passwordHash: 'hash',
      privateKeyPem: 'pem-field',
      secretAccessKey: 'secret-key',
      error: new Error(
        'password="two words" privateKey=-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      ),
    })

    const serialized = JSON.stringify(electronLog.error.mock.calls[0]?.[1])
    for (const secret of ['access-id', 'hash', 'pem-field', 'secret-key', 'two words', 'abc']) {
      expect(serialized).not.toContain(secret)
    }
  })
})
