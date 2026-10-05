import { createHash } from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'

import {
  openWebDavServerLifecycle,
  type WebDavServerLifecycleOptions,
} from '@electron/services/sync/integration/webDavServerLifecycle.js'

const BASE_PATH = '/dav'
const AUTHORIZATION = `Basic ${Buffer.from('marklab:secret').toString('base64')}`

export type WebDavServerFixture = {
  endpoint: string
  close: () => Promise<void>
  readFile: (relativePath: string) => Promise<string>
}

export const startWebDavServer = async (
  options: WebDavServerLifecycleOptions = {},
): Promise<WebDavServerFixture> => {
  const lifecycle = await openWebDavServerLifecycle(
    (root) =>
      http.createServer((request, response) => {
        void handleRequest(root, request, response).catch((error: unknown) => {
          if (!response.headersSent) response.writeHead(500)
          response.end(error instanceof Error ? error.message : 'fixture failure')
        })
      }),
    options,
  )
  const { root, server } = lifecycle
  const address = server.address()
  if (!address || typeof address === 'string') {
    await lifecycle.close()
    throw new Error('WebDAV fixture has no TCP port')
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    readFile: (relativePath) => fs.readFile(resolveFixturePath(root, relativePath), 'utf8'),
    close: lifecycle.close,
  }
}

const handleRequest = async (
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  if (request.headers.authorization !== AUTHORIZATION) {
    await drainRequest(request)
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Marklab fixture"' })
    response.end()
    return
  }
  if (request.method !== 'PUT') await drainRequest(request)
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const relativePath = fixtureRelativePath(url.pathname)
  if (relativePath === null) return sendStatus(response, 404)
  const target = resolveFixturePath(root, relativePath)
  switch (request.method) {
    case 'OPTIONS':
      response.writeHead(200, {
        Allow: 'OPTIONS, PROPFIND, MKCOL, GET, HEAD, PUT, DELETE, MOVE',
        DAV: '1, 2',
      })
      response.end()
      return
    case 'PROPFIND':
      return propfind(root, relativePath, target, request, response)
    case 'MKCOL':
      await fs.mkdir(target, { recursive: false }).catch((error: unknown) => {
        if (!hasCode(error, 'EEXIST')) throw error
      })
      return sendStatus(response, 201)
    case 'GET':
    case 'HEAD':
      return sendFile(target, request.method === 'HEAD', response)
    case 'PUT':
      return putFile(target, request, response)
    case 'DELETE':
      if (!(await exists(target))) return sendStatus(response, 404)
      if (!(await conditionMatches(target, request))) return sendStatus(response, 412)
      await fs.rm(target, { force: true, recursive: true })
      return sendStatus(response, 204)
    case 'MOVE':
      return moveFile(root, target, request, response)
    default:
      return sendStatus(response, 405)
  }
}

const drainRequest = async (request: IncomingMessage): Promise<void> => {
  if (request.readableEnded || request.destroyed) return
  request.resume()
  await once(request, 'end')
}

const propfind = async (
  root: string,
  relativePath: string,
  target: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  if (!(await exists(target))) return sendStatus(response, 404)
  const resources = [{ relativePath, target }]
  const stats = await fs.stat(target)
  if (stats.isDirectory() && request.headers.depth !== '0') {
    const children = await fs.readdir(target)
    for (const child of children) {
      resources.push({
        relativePath: path.posix.join(relativePath, child),
        target: resolveFixturePath(root, path.posix.join(relativePath, child)),
      })
    }
  }
  const entries = await Promise.all(resources.map(resourceXml))
  const body = `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">${entries.join('')}</d:multistatus>`
  response.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8' })
  response.end(body)
}

const resourceXml = async ({
  relativePath,
  target,
}: {
  relativePath: string
  target: string
}): Promise<string> => {
  const stats = await fs.stat(target)
  const directory = stats.isDirectory()
  const href = `${BASE_PATH}${relativePath ? `/${encodePath(relativePath)}` : '/'}${directory && relativePath ? '/' : ''}`
  const etag = directory ? `"directory-${stats.mtimeMs}"` : await fileEtag(target)
  return `<d:response><d:href>${escapeXml(href)}</d:href><d:propstat><d:prop><d:resourcetype>${directory ? '<d:collection/>' : ''}</d:resourcetype><d:getcontentlength>${directory ? 0 : stats.size}</d:getcontentlength><d:getlastmodified>${stats.mtime.toUTCString()}</d:getlastmodified><d:getetag>${etag}</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
}

const putFile = async (
  target: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const existed = await exists(target)
  if (!(await conditionMatches(target, request))) return sendStatus(response, 412)
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, Buffer.concat(chunks))
  response.writeHead(existed ? 204 : 201, { ETag: await fileEtag(target) })
  response.end()
}

const sendFile = async (
  target: string,
  headOnly: boolean,
  response: ServerResponse,
): Promise<void> => {
  if (!(await exists(target))) return sendStatus(response, 404)
  const stats = await fs.stat(target)
  if (!stats.isFile()) return sendStatus(response, 405)
  const body = await fs.readFile(target)
  response.writeHead(200, {
    'Content-Length': body.byteLength,
    'Content-Type': 'application/octet-stream',
    ETag: await fileEtag(target),
  })
  response.end(headOnly ? undefined : body)
}

const moveFile = async (
  root: string,
  source: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  if (!(await exists(source))) return sendStatus(response, 404)
  if (!(await conditionMatches(source, request))) return sendStatus(response, 412)
  const destinationHeader = request.headers.destination
  if (typeof destinationHeader !== 'string') return sendStatus(response, 400)
  const destinationUrl = new URL(destinationHeader, 'http://127.0.0.1')
  const relativeDestination = fixtureRelativePath(destinationUrl.pathname)
  if (relativeDestination === null) return sendStatus(response, 400)
  const destination = resolveFixturePath(root, relativeDestination)
  const destinationExists = await exists(destination)
  if (destinationExists && request.headers.overwrite === 'F') return sendStatus(response, 412)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  if (destinationExists) await fs.rm(destination, { force: true, recursive: true })
  await fs.rename(source, destination)
  return sendStatus(response, destinationExists ? 204 : 201)
}

const conditionMatches = async (target: string, request: IncomingMessage): Promise<boolean> => {
  const targetExists = await exists(target)
  if (request.headers['if-none-match'] === '*' && targetExists) return false
  const expected = request.headers['if-match']
  if (!expected) return true
  const actual = targetExists ? await fileEtag(target) : null
  return targetExists && expected === actual
}

const fixtureRelativePath = (pathname: string): string | null => {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded !== BASE_PATH && !decoded.startsWith(`${BASE_PATH}/`)) return null
  const relative = decoded.slice(BASE_PATH.length).replace(/^\/+/, '')
  if (relative.includes('\\') || relative.includes('\0')) return null
  const normalized = path.posix.normalize(`/${relative}`).slice(1)
  return normalized === '..' || normalized.startsWith('../') ? null : normalized
}

const resolveFixturePath = (root: string, relativePath: string): string => {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, ...relativePath.split('/').filter(Boolean))
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('WebDAV fixture path escaped its temporary root')
  }
  return resolved
}

const fileEtag = async (target: string): Promise<string> =>
  `"${createHash('sha256')
    .update(await fs.readFile(target))
    .digest('hex')}"`

const encodePath = (value: string): string => value.split('/').map(encodeURIComponent).join('/')
const escapeXml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
const exists = (target: string): Promise<boolean> =>
  fs.stat(target).then(
    () => true,
    () => false,
  )
const hasCode = (error: unknown, code: string): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === code)
const sendStatus = (response: ServerResponse, status: number): void => {
  response.writeHead(status)
  response.end()
}
