import { Launcher } from '@wdio/cli'
// eslint-disable-next-line no-restricted-imports -- Native E2E lifecycle remains test-only.
import { withNativeApplication } from '../e2e/tauri/application.ts'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin')
  throw new Error('Native graph community acceptance currently requires macOS')
const repository = fileURLToPath(new URL('../', import.meta.url))
const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-tauri-e2e-')))
const groups = ['Amber', 'Birch', 'Cedar']
const name = (group: string, index: number) => `${group}-${String(index).padStart(2, '0')}.md`
let exitCode: number
try {
  await Promise.all(
    ['data', 'cache', 'alpha', 'beta'].map((dir) => fs.mkdir(path.join(fixture, dir))),
  )
  await fs.writeFile(path.join(fixture, '.marklab-e2e'), 'native-wdio-v1\n')
  const documents = groups.flatMap((group, groupIndex) =>
    Array.from({ length: 37 }, (_, index) => {
      // A hub and four forward neighbors keep each group densely interconnected.
      // Only two single-link bridges join the three groups; no duplicate-link flood.
      const targets = new Set([0, ...[1, 2, 3, 4].map((step) => (index + step) % 37)])
      targets.delete(index)
      const links = [...targets].map((target) => `[${group} ${target}](${name(group, target)})`)
      if (index === 36 && groupIndex < groups.length - 1)
        links.push(`[Bridge](${name(groups[groupIndex + 1]!, 0)})`)
      return {
        file: name(group, index),
        content: `${group} community document ${index}. Synthetic native acceptance only.\n\n${links.join(' ')}\n\nEditable ending ${group} ${index}.\n`,
      }
    }),
  )
  // Filesystem has no multi-file write API. Keep each write batch bounded to 12
  // tiny fixture documents and await it before starting the next batch.
  for (let offset = 0; offset < documents.length; offset += 12)
    await Promise.all(
      documents
        .slice(offset, offset + 12)
        .map(({ file, content }) => fs.writeFile(path.join(fixture, 'alpha', file), content)),
    )
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('No driver port'))
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
  process.env.MARKLAB_TAURI_E2E_ROOT = fixture
  process.env.MARKLAB_E2E_DATA_DIR = path.join(fixture, 'data')
  process.env.MARKLAB_E2E_CACHE_DIR = path.join(fixture, 'cache')
  process.env.MARKLAB_E2E_DRIVER_PORT = String(port)
  process.env.MARKLAB_E2E_BASELINE = '0'
  process.env.MARKLAB_E2E_REACT_PROFILE = '0'
  const launcher = new Launcher(path.join(repository, 'wdio.tauri.conf.ts'), {
    spec: [path.join(repository, 'e2e/tauri/graphCommunities.spec.ts')],
  })
  exitCode = await withNativeApplication(
    path.join(fixture, 'alpha'),
    async () => (await launcher.run()) ?? 1,
  )
} finally {
  await fs.rm(fixture, { recursive: true, force: true })
}
process.exit(exitCode)
