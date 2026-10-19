import { Launcher } from '@wdio/cli'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { $ } from 'zx'

if (process.platform !== 'darwin')
  throw new Error('Native workspace graph memory profiling currently requires macOS')
const repository = fileURLToPath(new URL('../', import.meta.url))
const source = await fs.realpath(process.argv[2] ?? '')
if (!(await fs.stat(source)).isDirectory()) throw new Error('Provide a workspace directory')
const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-tauri-e2e-')))
let exitCode: number
try {
  for (const name of ['data', 'cache', 'beta']) await fs.mkdir(path.join(fixture, name))
  await fs.cp(source, path.join(fixture, 'alpha'), {
    recursive: true,
    filter: async (entry) =>
      !['.git', 'node_modules', '.marklab'].includes(path.basename(entry)) &&
      !(await fs.lstat(entry)).isSymbolicLink(),
  })
  await fs.writeFile(path.join(fixture, '.marklab-e2e'), 'native-wdio-v1\n')
  const processes = await $({ quiet: true })`/bin/ps -axo pid=,rss=,comm=`
  await fs.writeFile(path.join(fixture, 'processes-before.txt'), processes.stdout)
  process.env.MARKLAB_TAURI_E2E_ROOT = fixture
  process.env.MARKLAB_E2E_DATA_DIR = path.join(fixture, 'data')
  process.env.MARKLAB_E2E_CACHE_DIR = path.join(fixture, 'cache')
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('No driver port'))
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
  process.env.MARKLAB_E2E_DRIVER_PORT = String(port)
  process.env.MARKLAB_E2E_BASELINE = process.argv.includes('--baseline') ? '1' : '0'
  process.env.MARKLAB_E2E_RENDER_LAYERS = process.argv.includes('--layers') ? '1' : '0'
  process.env.MARKLAB_E2E_REACT_PROFILE = process.argv.includes('--react') ? '1' : '0'
  const launcher = new Launcher(path.join(repository, 'wdio.tauri.conf.ts'), {
    spec: [path.join(repository, 'e2e/tauri/wikiPerformance.spec.ts')],
  })
  exitCode = (await launcher.run()) ?? 1
} finally {
  await fs.rm(fixture, { recursive: true, force: true })
}
process.exit(exitCode)
