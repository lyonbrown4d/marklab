/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Native E2E helpers never enter production bundles. */
import { fixturePaths } from './fixturePaths.js'
import { currentRoot, invokeNative, openEditor, switchToWorkspace } from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

const fixture = fixturePaths()
const repository = fileURLToPath(new URL('../../', import.meta.url))
const binary = path.join(
  repository,
  `src-tauri/target/debug/marklab-desktop${process.platform === 'win32' ? '.exe' : ''}`,
)
const senderDirectory = path.join(fixture.root, 'cli sender cwd')
const workspaceName = 'requested workspace with spaces'
const documentName = 'requested note with spaces.md'
const workspace = path.join(senderDirectory, workspaceName)
const document = path.join(senderDirectory, documentName)

const closeCreatedOwners = async (originalHandles: ReadonlySet<string>) => {
  // Window operations change the driver's selected owner, so close them in order.
  const created = (await browser.getWindowHandles()).filter(
    (handle) => !originalHandles.has(handle) && handle.startsWith('workspace-'),
  )
  for (const handle of created) {
    await browser.switchToWindow(handle)
    const error = await browser.execute(() => {
      const runtime = window.marklabTauri
      if (!runtime) return 'Cannot close a CLI owner without the real Tauri runtime'
      window.setTimeout(() => {
        void runtime.window.close().catch(console.error)
      }, 0)
      return null
    })
    assert.equal(error, null)
    await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes(handle), {
      timeout: 40_000,
      timeoutMsg: 'Production close did not remove the CLI-created owner',
    })
  }
}

const assertForwardedTarget = async ({
  args,
  target,
  kind,
  file,
  marker,
}: {
  args: string[]
  target: string
  kind: 'external' | 'single'
  file: string
  marker: string
}) => {
  await switchToWorkspace(fixture.alpha)
  const alphaHandle = await browser.getWindowHandle()
  const originalHandles = new Set(await browser.getWindowHandles())
  const alphaBefore = await fs.readFile(path.join(fixture.alpha, 'Editor.md'), 'utf8')
  try {
    // Launch the real executable: the official single-instance plugin must forward
    // both the argv array and this different working directory before exiting.
    await promisify(execFile)(binary, args, {
      cwd: senderDirectory,
      timeout: 15_000,
      env: { ...process.env, TAURI_WEBDRIVER_PORT: process.env.MARKLAB_E2E_DRIVER_PORT },
    })
    await switchToWorkspace(target)
    assert.notEqual(await browser.getWindowHandle(), alphaHandle)
    assert.deepEqual(await invokeNative('fs_get_root_info'), { kind, path: target })
    assert.notEqual(await currentRoot(), fixture.alpha)
    await openEditor(file)
    const text = await browser.$('[data-testid="markdown-editor"]').getText()
    assert.ok(text.includes(marker), 'The CLI target document did not reach the real editor')
    assert.doesNotMatch(text, /alpha-only native workspace/)
    assert.ok((await browser.getWindowHandles()).includes(alphaHandle))
  } finally {
    await closeCreatedOwners(originalHandles)
    await switchToWorkspace(fixture.alpha)
    assert.equal(await currentRoot(), fixture.alpha)
    assert.equal(await fs.readFile(path.join(fixture.alpha, 'Editor.md'), 'utf8'), alphaBefore)
  }
}

describe('official CLI single-instance forwarding', () => {
  before(async () => {
    await fs.mkdir(workspace, { recursive: true })
    await Promise.all([
      fs.writeFile(
        path.join(workspace, 'Editor.md'),
        '# CLI workspace\n\ncli-workspace-only marker.\n',
      ),
      fs.writeFile(document, '# CLI document\n\ncli-document-only marker.\n'),
    ])
  })

  it('opens --workspace relative to the sender cwd without reusing the old root', async () => {
    await assertForwardedTarget({
      args: ['--workspace', workspaceName],
      target: workspace,
      kind: 'external',
      file: 'Editor.md',
      marker: 'cli-workspace-only marker',
    })
  })

  it('opens --file relative to the sender cwd as a single-document owner', async () => {
    await assertForwardedTarget({
      args: ['--file', documentName],
      target: document,
      kind: 'single',
      file: documentName,
      marker: 'cli-document-only marker',
    })
  })
})
