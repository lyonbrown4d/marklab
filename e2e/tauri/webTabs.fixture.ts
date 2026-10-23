import http from 'node:http'
import { randomUUID } from 'node:crypto'

export const createWebTabFixture = async ({ refreshOnReload = false } = {}) => {
  const cookieName = `marklab_native_${randomUUID().replaceAll('-', '')}`
  const accounts: boolean[] = []
  let version = 1
  let previewRequests = 0
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end()
      return
    }
    const authenticated = (request.headers.cookie ?? '').includes(`${cookieName}=accepted`)
    if (pathname === '/account') accounts.push(authenticated)
    if (pathname === '/preview' && refreshOnReload) version = ++previewRequests > 1 ? 2 : 1
    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    }
    if (pathname === '/login')
      headers['Set-Cookie'] = `${cookieName}=accepted; HttpOnly; SameSite=Lax; Path=/; Max-Age=120`
    if (pathname === '/logout')
      headers['Set-Cookie'] = `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
    response.writeHead(200, headers)
    response.end(
      `<!doctype html><meta charset="utf-8"><title>Native web fixture ${version}</title>` +
        `<body style="margin:0;background:${version === 1 ? '#1268aa' : '#bb1834'};color:white">` +
        `<h1>Native frame ${version}</h1><p>${authenticated ? 'Signed in' : 'Public fixture'}</p>`,
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture server address')
  return {
    base: `http://127.0.0.1:${address.port}`,
    accounts,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
