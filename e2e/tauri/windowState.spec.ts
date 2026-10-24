/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Native E2E helpers never enter production bundles. */
import { fixturePaths } from './fixturePaths.js'
import { assertWindowButtonsAligned } from './windowButtons.js'
import {
  closeThroughApplication,
  openEditor,
  switchToWorkspace,
  typeAtEditorEnd,
  waitForRustMarker,
} from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

const fixture = fixturePaths()
const repository = fileURLToPath(new URL('../../', import.meta.url))

const reopen = async () => {
  // Exercise real single-instance IPC. The second process must exit before
  // binding another embedded WebDriver server, even when no windows are open.
  await promisify(execFile)(path.join(repository, 'src-tauri/target/debug/marklab-desktop'), [], {
    timeout: 15_000,
    env: { ...process.env, TAURI_WEBDRIVER_PORT: process.env.MARKLAB_E2E_DRIVER_PORT },
  })
  await switchToWorkspace(fixture.alpha)
  await openEditor()
  await assertWindowButtonsAligned(fixture.alpha)
}

const macOS = process.platform === 'darwin' ? describe : describe.skip

macOS('native window state and single instance', () => {
  it('remembers main geometry without tracking temporary windows and reopens through a second launch', async () => {
    await switchToWorkspace(fixture.alpha)
    await openEditor()
    await browser.setWindowRect(120, 140, 900, 700)
    const before = await browser.getWindowRect()
    const scale = await browser.execute(() => window.devicePixelRatio)
    await typeAtEditorEnd(' window-state-marker')
    await waitForRustMarker('window-state-marker')
    await closeThroughApplication('window-state-marker')
    await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes('main'))
    const defaults = JSON.parse(
      await fs.readFile(path.join(fixture.data, 'v1/window-state.json'), 'utf8'),
    ) as Record<string, { x: number; y: number }>
    assert.deepEqual(Object.keys(defaults), ['main'])
    assert.equal(defaults.main.x, Math.round(before.x * scale))
    assert.equal(defaults.main.y, Math.round(before.y * scale))

    await reopen()
    const after = await browser.getWindowRect()
    assert.equal(after.x, before.x)
    assert.equal(after.y, before.y)
    assert.equal(after.width, before.width)
    assert.ok(Math.abs(after.height - before.height) <= 1, 'Reopen changed the window height')
    assert.match(
      await browser.$('[data-testid="markdown-editor"]').getText(),
      /window-state-marker/,
    )
    await closeThroughApplication('window-state-marker')
    await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes('main'))
    // Simulate missing preferences in this generated fixture only. Keep
    // documents, sessions and the real plugin's saved state untouched.
    const database = new DatabaseSync(path.join(fixture.data, 'v1/tauri-storage/marklab.sqlite'))
    try {
      database.exec('DELETE FROM window_state')
    } finally {
      database.close()
    }
    await reopen()
    const fallback = await browser.getWindowRect()
    assert.equal(fallback.x, before.x)
    assert.equal(fallback.y, before.y)
    assert.equal(fallback.width, 800, 'Missing workspace geometry should use the default size')
  })

  it('still saves and closes when the plugin state file cannot be written', async () => {
    await switchToWorkspace(fixture.alpha)
    await openEditor()
    const file = path.join(fixture.data, 'v1/window-state.json')
    const backup = `${file}.saved`
    await fs.rename(file, backup)
    try {
      // Only this generated preference path is replaced; documents remain normal files.
      await fs.mkdir(file)
      await typeAtEditorEnd(' preference-failure-marker')
      await waitForRustMarker('preference-failure-marker')
      await closeThroughApplication('preference-failure-marker')
      await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes('main'))
      assert.match(
        await fs.readFile(path.join(fixture.alpha, 'Editor.md'), 'utf8'),
        /preference-failure-marker/,
      )
    } finally {
      await fs.rm(file, { recursive: true, force: true })
      await fs.rename(backup, file)
    }
    await reopen()
  })
})
