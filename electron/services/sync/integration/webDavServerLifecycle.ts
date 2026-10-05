import fs from 'node:fs/promises'
import type { Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'

export type WebDavServerLifecycleOptions = {
  closeServer?: (server: Server) => Promise<void>
  createRoot?: () => Promise<string>
  listen?: (server: Server) => Promise<void>
  removeRoot?: (root: string) => Promise<void>
}

export type WebDavServerLifecycle = {
  root: string
  server: Server
  close: () => Promise<void>
}

export const openWebDavServerLifecycle = async (
  createServer: (root: string) => Server,
  options: WebDavServerLifecycleOptions = {},
): Promise<WebDavServerLifecycle> => {
  const createRoot = options.createRoot ?? defaultCreateRoot
  const removeRoot = options.removeRoot ?? defaultRemoveRoot
  const closeServer = options.closeServer ?? defaultCloseServer
  const listen = options.listen ?? defaultListen
  const root = await createRoot()
  let server: Server | undefined
  try {
    server = createServer(root)
    await listen(server)
  } catch (error) {
    const failures = [error]
    if (server?.listening) await collectFailure(failures, () => closeServer(server!))
    await collectFailure(failures, () => removeRoot(root))
    throw new AggregateError(failures, 'Failed to start the WebDAV server fixture', {
      cause: error,
    })
  }
  let closed = false
  return {
    root,
    server,
    close: async () => {
      if (closed) return
      closed = true
      const failures: unknown[] = []
      await collectFailure(failures, () => closeServer(server))
      await collectFailure(failures, () => removeRoot(root))
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Failed to close the WebDAV server fixture')
      }
    },
  }
}

const defaultCreateRoot = (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'marklab-webdav-server-'))

const defaultListen = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('error', onError)
      server.off('listening', onListening)
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onListening = () => {
      cleanup()
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })

const defaultCloseServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.closeIdleConnections()
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
    server.closeAllConnections()
  })

const defaultRemoveRoot = async (root: string): Promise<void> => {
  const resolved = path.resolve(root)
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith('marklab-webdav-server-')
  ) {
    throw new Error('Refusing to remove a path outside the WebDAV test fixture')
  }
  await fs.rm(resolved, { force: true, recursive: true })
}

const collectFailure = async (
  failures: unknown[],
  operation: () => Promise<void>,
): Promise<void> => {
  try {
    await operation()
  } catch (error) {
    failures.push(error)
  }
}
