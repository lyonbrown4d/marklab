/// <reference types="mocha" />
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Native E2E helpers never enter production bundles. */
import { fixturePaths } from './fixturePaths.js'
import { sessionOwnerCount } from './nativeMetadata.js'
import {
  closeThroughApplication,
  currentRoot,
  invokeNative,
  openEditor,
  switchToWorkspace,
  typeAtEditorEnd,
  waitForRustMarker,
} from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

const fixture = fixturePaths()

describe('real Tauri desktop', () => {
  it('loads the external CLI root and saves a Plate edit through Rust buffers', async () => {
    await switchToWorkspace(fixture.alpha)
    assert.equal(await currentRoot(), fixture.alpha)
    const platform = await invokeNative<{ platform: string }>('app_get_platform')
    assert.equal(
      platform.platform,
      process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
    )
    await openEditor()
    const editor = await browser.$('[data-testid="markdown-editor"]')
    assert.match(await editor.getText(), /alpha-only native workspace/)
    await typeAtEditorEnd(' native-persisted-marker')
    // The production flush command drains actual Rust buffers, not a test handler.
    await waitForRustMarker('native-persisted-marker')
    await invokeNative<number>('fs_flush_buffers')
    await browser.waitUntil(async () =>
      (await fs.readFile(path.join(fixture.alpha, 'Editor.md'), 'utf8')).includes(
        'native-persisted-marker',
      ),
    )
    const snapshot = await invokeNative<{ content: string }>('fs_open_buffer_snapshot', {
      path: 'Editor.md',
    })
    assert.match(snapshot.content, /native-persisted-marker/)
    assert.match(snapshot.content, /alpha-only native workspace/)
    assert.equal((await fs.readdir(fixture.data)).includes('v1'), true)
  })

  it('preserves recent edits on production close and keeps its neighbor isolated', async () => {
    await switchToWorkspace(fixture.alpha)
    await openEditor()
    const alphaBefore = await fs.readFile(path.join(fixture.alpha, 'Editor.md'), 'utf8')
    const alphaHandle = await browser.getWindowHandle()
    const opened = await invokeNative<{ ok: boolean }>('open_path_in_new_window', {
      path: fixture.beta,
    })
    assert.equal(opened.ok, true)
    await switchToWorkspace(fixture.beta)
    const betaHandle = await browser.getWindowHandle()
    assert.notEqual(betaHandle, alphaHandle)
    await openEditor()
    const editor = await browser.$('[data-testid="markdown-editor"]')
    assert.match(await editor.getText(), /beta-only native workspace/)
    await typeAtEditorEnd(' beta-persisted-marker')
    await waitForRustMarker('beta-persisted-marker')
    assert.equal(sessionOwnerCount(fixture.data, betaHandle), 1)
    await closeThroughApplication('beta-persisted-marker')
    await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes(betaHandle), {
      timeout: 40_000,
      timeoutMsg: 'Production close did not complete its flush and destroy the beta owner',
    })
    assert.match(
      await fs.readFile(path.join(fixture.beta, 'Editor.md'), 'utf8'),
      /beta-persisted-marker/,
    )
    assert.match(
      await fs.readFile(path.join(fixture.beta, 'Editor.md'), 'utf8'),
      /beta-only native workspace/,
    )
    assert.equal(sessionOwnerCount(fixture.data, betaHandle), 0)
    await browser.switchToWindow(alphaHandle)
    assert.equal(await currentRoot(), fixture.alpha)
    assert.equal(await fs.readFile(path.join(fixture.alpha, 'Editor.md'), 'utf8'), alphaBefore)
    assert.match(
      await browser.$('[data-testid="markdown-editor"]').getText(),
      /alpha-only native workspace/,
    )
  })
})
