import { Launcher } from '@wdio/cli'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { $ } from 'zx'
import { z } from 'zod'

const repository = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(import.meta.url)
const phaseSchema = z.enum(['seed', 'baseline', 'current'])

const allocatePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('No driver port')))
        return
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })

if (process.platform !== 'darwin') throw new Error('Warm native graph validation requires macOS')

if (process.argv[2] === '--phase') {
  const phase = phaseSchema.parse(process.argv[3])
  if (process.env.MARKLAB_E2E_WARM_GRAPH_PHASE !== phase)
    throw new Error('Warm graph phase does not match its isolated launcher')
  const launcher = new Launcher(path.join(repository, 'wdio.tauri.conf.ts'), {
    spec: [path.join(repository, 'e2e/tauri/wikiWarmLayout.spec.ts')],
  })
  process.exit((await launcher.run()) ?? 1)
} else {
  const source = await fs.realpath(process.argv[2] ?? '')
  if (!(await fs.stat(source)).isDirectory()) throw new Error('Provide a workspace directory')
  const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-tauri-e2e-')))
  let exitCode = 1
  try {
    for (const name of ['data', 'cache', 'beta']) await fs.mkdir(path.join(fixture, name))
    await fs.cp(source, path.join(fixture, 'alpha'), {
      recursive: true,
      filter: async (entry) =>
        !['.git', 'node_modules', '.marklab'].includes(path.basename(entry)) &&
        !(await fs.lstat(entry)).isSymbolicLink(),
    })
    await fs.writeFile(path.join(fixture, '.marklab-e2e'), 'native-wdio-v1\n')
    // Independent Node processes avoid retaining WDIO's evaluated binary selector.
    // Each service fully tears down before the next uses the same SQLite/cache.
    for (const phase of phaseSchema.options) {
      const port = await allocatePort()
      const output = await $({
        cwd: repository,
        timeout: '5m',
        timeoutSignal: 'SIGTERM',
        env: {
          ...process.env,
          MARKLAB_TAURI_E2E_ROOT: fixture,
          MARKLAB_E2E_DATA_DIR: path.join(fixture, 'data'),
          MARKLAB_E2E_CACHE_DIR: path.join(fixture, 'cache'),
          MARKLAB_E2E_DRIVER_PORT: String(port),
          MARKLAB_E2E_WARM_GRAPH_PHASE: phase,
          MARKLAB_E2E_BASELINE: phase === 'baseline' ? '1' : '0',
          MARKLAB_E2E_REACT_PROFILE: '0',
          MARKLAB_E2E_RENDER_LAYERS: '0',
          MARKLAB_E2E_GRAPH_SCREENSHOT: '0',
        },
      })`${process.execPath} --experimental-strip-types ${script} --phase ${phase}`
      process.stdout.write(output.stdout)
      process.stderr.write(output.stderr)
    }
    exitCode = 0
  } catch (error) {
    console.error(error)
  } finally {
    await fs.rm(fixture, { recursive: true, force: true })
  }
  process.exit(exitCode)
}
