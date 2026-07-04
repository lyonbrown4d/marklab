import { execa } from 'execa'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import getPort from 'get-port'

const DEFAULT_DEV_SERVER_PORT = 5173
const RANDOM_DEV_SERVER_PORT = 0 as const
const DEV_SERVER_HOST = '127.0.0.1'

const require = createRequire(import.meta.url)

const parsePort = (value: string | undefined): number | null => {
  if (!value) return null
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null
  return port
}

const resolveDevServerPort = async (): Promise<number> => {
  const configuredPort = parsePort(process.env.MARKLAB_DEV_SERVER_PORT ?? process.env.VITE_PORT)
  if (configuredPort !== null) {
    return getPort({ host: DEV_SERVER_HOST, port: configuredPort })
  }

  return getPort({
    host: DEV_SERVER_HOST,
    port: [DEFAULT_DEV_SERVER_PORT, RANDOM_DEV_SERVER_PORT],
  })
}

const resolveViteCliPath = (): string => {
  const viteEntryPath = require.resolve('vite')
  return join(dirname(viteEntryPath), '..', '..', 'bin', 'vite.js')
}

const createChildEnv = (port: number): NodeJS.ProcessEnv => {
  const childEnv: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key || value === undefined || value.includes('\u0000')) continue
    childEnv[key] = value
  }

  childEnv.MARKLAB_DEV_SERVER_PORT = String(port)
  childEnv.MARKLAB_DEV_SERVER_HOST = DEV_SERVER_HOST
  return childEnv
}

const run = async (): Promise<void> => {
  const port = await resolveDevServerPort()
  if (process.argv.includes('--print-port')) {
    console.log(port)
    return
  }

  await execa(process.execPath, [resolveViteCliPath(), '--mode', 'electron'], {
    env: createChildEnv(port),
    stdio: 'inherit',
  })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
