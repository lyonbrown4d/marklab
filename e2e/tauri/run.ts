import { Launcher } from '@wdio/cli'
// eslint-disable-next-line no-restricted-imports -- Native E2E lifecycle remains test-only.
import { applicationBinary, usesCef, withNativeApplication } from './application.ts'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
// eslint-disable-next-line no-restricted-imports -- Opt-in real-corpus measurements remain test-only.
import {
  copyPerformanceWorkspace,
  snapshotWorkspace,
  type RealWorkspace,
} from '../performance/realWorkspaceFixture.ts'

// Node runs short CLI preflights; the official service owns the resident app.
const repository = fileURLToPath(new URL('../../', import.meta.url))
const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-tauri-e2e-')))
let exitCode = 1
let performanceSource: RealWorkspace | undefined
try {
  for (const name of ['data', 'cache', 'alpha', 'beta']) await fs.mkdir(path.join(fixture, name))
  for (const name of ['alpha', 'beta']) {
    await fs.writeFile(
      path.join(fixture, name, 'Editor.md'),
      `# Native ${name}\n\n${name}-only native workspace.\n`,
    )
    await fs.writeFile(path.join(fixture, name, 'Second.md'), `# Second ${name}\n`)
  }
  await fs.writeFile(
    path.join(fixture, 'alpha', 'Memory.md'),
    '# Native memory\n\nalpha-only memory workspace.\n',
  )
  await fs.writeFile(path.join(fixture, '.marklab-e2e'), 'native-wdio-v1\n')
  const diagram = '@startuml\nAlice -> Bob: native-plantuml\n@enduml\n'
  await fs.copyFile(
    path.join(repository, 'e2e/tauri/fixtures/Workbook.xlsx'),
    path.join(fixture, 'alpha', 'Workbook.xlsx'),
  )
  await fs.writeFile(
    path.join(fixture, 'alpha', 'Table.csv'),
    'Name,Count\nnative-csv-preview,42\n',
  )
  await fs.writeFile(
    path.join(fixture, 'alpha', 'Table.tsv'),
    'Name\tCount\nnative-tsv-preview\t21\n',
  )
  await fs.writeFile(
    path.join(fixture, 'alpha', 'Flow.mmd'),
    'flowchart LR\n A[native-mermaid-file] --> B[Preview]\n',
  )
  await fs.writeFile(
    path.join(fixture, 'alpha', 'Page.html'),
    '<style>p { color: red }</style><p>native-html-preview</p><script>parent.__html_preview_escape=true</script>',
  )
  await fs.writeFile(
    path.join(fixture, 'alpha', 'Previews.md'),
    '# Embedded previews\n\n![](Table.csv)\n\n![](Workbook.xlsx)\n\n![](Flow.mmd)\n\n![](Page.html)\n',
  )
  await fs.writeFile(path.join(fixture, 'alpha', 'Diagram.puml'), diagram)
  await fs.writeFile(
    path.join(fixture, 'alpha', 'Diagram.md'),
    `# Diagram\n\n\`\`\`plantuml\n${diagram}\`\`\`\n`,
  )
  process.env.MARKLAB_TAURI_E2E_ROOT = fixture
  process.env.MARKLAB_E2E_DATA_DIR = path.join(fixture, 'data')
  process.env.MARKLAB_E2E_CACHE_DIR = path.join(fixture, 'cache')
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string')
        return server.close(() => reject(new Error('Cannot allocate an E2E driver port')))
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
  process.env.MARKLAB_E2E_DRIVER_PORT = String(port)
  // Exercise cold terminal exits before the service owns a resident singleton.
  const binary = applicationBinary()
  const execute = promisify(execFile)
  const options = {
    // The first signed debug CEF launch can include a cold framework validation.
    // This bounds CLI preflight only; editor/startup performance budgets stay unchanged.
    timeout: usesCef ? 60_000 : 15_000,
    env: { ...process.env },
  }
  const help = await execute(binary, ['--help'], options)
  assert.match(help.stdout, /--workspace/)
  assert.match(help.stdout, /--file/)
  const manifest = JSON.parse(await fs.readFile(path.join(repository, 'package.json'), 'utf8')) as {
    version: string
  }
  const version = await execute(binary, ['--version'], options)
  assert.equal(version.stdout.trim().split(/\s+/).at(-1), manifest.version)
  for (const args of [
    ['--workspace', path.join(fixture, 'missing-workspace')],
    [path.join(fixture, 'missing.js')],
  ]) {
    await assert.rejects(execute(binary, args, options), (error: unknown) => {
      assert.ok(error instanceof Error && 'code' in error && 'stderr' in error)
      assert.equal(error.code, 1)
      // The production startup reporter prints the message, not BackendError.code.
      assert.match(String(error.stderr), /Cannot open/)
      return true
    })
  }
  const performancePath = process.env.MARKLAB_PERFORMANCE_WORKSPACE
  if (performancePath) {
    performanceSource = await copyPerformanceWorkspace(
      performancePath,
      path.join(fixture, 'performance'),
    )
    await fs.writeFile(path.join(fixture, 'performance.json'), JSON.stringify(performanceSource))
  }
  const selectedSpecs = process.argv.slice(2)
  // Keep positional selections in the same ordered worker as the default suite.
  // CLI `spec` overrides flatten groups and restart the resident native service.
  process.env.MARKLAB_E2E_SPEC_FILES = JSON.stringify(
    selectedSpecs.map((spec) => path.resolve(repository, spec)),
  )
  const launcher = new Launcher(path.join(repository, 'wdio.tauri.conf.ts'))
  process.env.MARKLAB_PERFORMANCE_LAUNCH_EPOCH_MS = String(Date.now())
  exitCode = await withNativeApplication(
    performanceSource ? path.join(fixture, 'performance') : path.join(fixture, 'alpha'),
    async () => (await launcher.run()) ?? 1,
  )
} catch (error) {
  console.error(error)
} finally {
  if (performanceSource) {
    try {
      const after = await snapshotWorkspace(performanceSource.source)
      assert.deepEqual(
        after,
        performanceSource,
        'The performance source changed during measurement',
      )
      await fs.mkdir(path.join(repository, 'test-results/tauri/performance'), { recursive: true })
      await fs.writeFile(
        path.join(repository, 'test-results/tauri/performance/source-integrity.json'),
        JSON.stringify(
          {
            source: performanceSource.source,
            files: after.files.length,
            bytes: after.bytes,
            unchanged: true,
          },
          null,
          2,
        ),
      )
    } catch (error) {
      console.error(error)
      exitCode = 1
    }
  }
  // Launcher.run settles after the service has stopped its owned app process.
  try {
    await fs.rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (error) {
    console.error(error)
    exitCode = 1
  }
}
// WDIO's async-exit-hook forces beforeExit to 0, overriding process.exitCode.
// Match WDIO's CLI: exit explicitly, after service teardown and fixture cleanup.
process.exit(exitCode)
