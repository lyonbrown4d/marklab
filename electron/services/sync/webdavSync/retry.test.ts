import { describe, expect, it, vi } from 'vitest'

import { remoteErrorCode, withRemoteRetry } from '@electron/services/sync/webdavSync/retry.js'

describe('withRemoteRetry', () => {
  it('retries network failures with bounded backoff', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 'network' })
      .mockRejectedValueOnce({ code: 'network' })
      .mockResolvedValue('ok')
    const sleep = vi.fn(async () => undefined)

    await expect(
      withRemoteRetry(operation, {
        signal: new AbortController().signal,
        sleep,
        random: () => 0,
      }),
    ).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it.each(['unauthorized', 'validation', 'precondition_failed', 'conflict'])(
    'does not retry %s errors',
    async (code) => {
      const operation = vi.fn(async () => Promise.reject({ code }))

      await expect(
        withRemoteRetry(operation, { signal: new AbortController().signal }),
      ).rejects.toMatchObject({ code })
      expect(operation).toHaveBeenCalledOnce()
    },
  )

  it.each([401, 403])('does not retry HTTP %s authorization failures', async (status) => {
    const operation = vi.fn(async () => Promise.reject({ status }))

    await expect(
      withRemoteRetry(operation, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ status })
    expect(operation).toHaveBeenCalledOnce()
  })

  it.each([
    ['AUTHENTICATION_FAILED', 'unauthorized'],
    ['FORBIDDEN', 'unauthorized'],
    ['ABORTED', 'aborted'],
    ['TIMEOUT', 'network'],
    ['NOT_FOUND', 'not_found'],
    ['INVALID_PATH', 'validation'],
    ['REMOTE_ERROR', 'remote_io'],
  ])('normalizes WebDAV code %s to %s', (code, expected) => {
    expect(remoteErrorCode({ code })).toBe(expected)
  })

  it('retries WebDAV timeout failures as network failures', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 'TIMEOUT' })
      .mockResolvedValue('ok')

    await expect(
      withRemoteRetry(operation, {
        signal: new AbortController().signal,
        sleep: async () => undefined,
      }),
    ).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('cancels during backoff', async () => {
    const controller = new AbortController()
    const operation = vi.fn(async () => Promise.reject({ code: 'network' }))
    const sleep = vi.fn(async (_delay: number, signal: AbortSignal) => {
      controller.abort()
      signal.throwIfAborted()
    })

    await expect(
      withRemoteRetry(operation, { signal: controller.signal, sleep }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(operation).toHaveBeenCalledOnce()
  })
})
