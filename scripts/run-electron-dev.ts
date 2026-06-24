import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'

const DEFAULT_DEV_SERVER_PORT = 5173
const RANDOM_DEV_SERVER_PORT = 0
const DEV_SERVER_PORT_HOST = '127.0.0.1'

const require = createRequire(import.meta.url)

const parsePort = (value) => {
  if (!value) return null
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null
  return port
}

const isPortAvailable = (port) => {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: DEV_SERVER_PORT_HOST, port }, () => {
      server.close(() => resolve(true))
    })
  })
}

const resolveDevServerPort = async () => {
  const configuredPort = parsePort(process.env.MARKLAB_DEV_SERVER_PORT ?? process.env.VITE_PORT)
  if (configuredPort !== null) return configuredPort
  return (await isPortAvailable(DEFAULT_DEV_SERVER_PORT))
    ? DEFAULT_DEV_SERVER_PORT
    : RANDOM_DEV_SERVER_PORT
}

const resolveViteCliPath = () => {
  const viteEntryPath = require.resolve('vite')
  return join(dirname(viteEntryPath), '..', '..', 'bin', 'vite.js')
}

const createChildEnv = (port) => {
  const childEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key || key.includes('\0') || value === undefined || value.includes('\0')) continue
    childEnv[key] = value
  }
  childEnv.MARKLAB_DEV_SERVER_PORT = String(port)
  return childEnv
}

const run = async () => {
  const port = await resolveDevServerPort()
  if (process.argv.includes('--print-port')) {
    console.log(port)
    return
  }

  const child = spawn(process.execPath, [resolveViteCliPath(), '--mode', 'electron'], {
    env: createChildEnv(port),
    stdio: 'inherit',
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
