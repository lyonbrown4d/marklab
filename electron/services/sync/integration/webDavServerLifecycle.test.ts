import fs from 'node:fs/promises'
import http, { type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { openWebDavServerLifecycle } from '@electron/services/sync/integration/webDavServerLifecycle.js'

const fallbackRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    fallbackRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('WebDAV server fixture lifecycle', () => {
  it('removes its temporary root when listening fails', async () => {
    const root = await temporaryRoot()
    const listenFailure = new Error('listen failed')

    await expect(
      openWebDavServerLifecycle(() => http.createServer(), {
        createRoot: async () => root,
        listen: async () => {
          throw listenFailure
        },
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AggregateError && error.errors.includes(listenFailure),
    )
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes its temporary root and reports every close failure', async () => {
    const root = await temporaryRoot()
    const closeFailure = new Error('server close failed')
    const removeFailure = new Error('root remove failed')
    const removeAttempts: string[] = []
    const lifecycle = await openWebDavServerLifecycle(() => http.createServer(), {
      createRoot: async () => root,
      closeServer: async (server) => {
        await closeNormally(server)
        throw closeFailure
      },
      removeRoot: async (candidate) => {
        removeAttempts.push(candidate)
        await fs.rm(candidate, { force: true, recursive: true })
        throw removeFailure
      },
    })

    await expect(lifecycle.close()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AggregateError &&
        error.errors.includes(closeFailure) &&
        error.errors.includes(removeFailure),
    )
    expect(removeAttempts).toEqual([root])
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

const temporaryRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-webdav-server-'))
  fallbackRoots.push(root)
  return root
}

const closeNormally = (server: Server): Promise<void> =>
  new Promise((resolve, reject) =>
    server.close((error) => {
      server.closeAllConnections()
      if (error) reject(error)
      else resolve()
    }),
  )
