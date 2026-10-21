/// <reference types="mocha" />
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Native acceptance helpers only. */
import { fixturePaths } from './fixturePaths.js'
import { invokeNative, openEditor, switchToWorkspace } from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

const fixture = fixturePaths()
const preview = '[data-plate-preview="plantuml"]'

const expectNativeImage = async () => {
  await browser.$(`${preview} img`).waitForDisplayed({ timeout: 45_000 })
  await browser.waitUntil(
    () =>
      browser.execute((selector) => {
        const image = document.querySelector<HTMLImageElement>(`${selector} img`)
        return Boolean(image?.complete && image.naturalWidth > 0)
      }, preview),
    { timeout: 30_000, timeoutMsg: 'The native SVG resource did not decode' },
  )
  const image = await browser.execute((selector) => {
    const image = document.querySelector<HTMLImageElement>(`${selector} img`)
    return { loaded: Boolean(image?.complete && image.naturalWidth > 0), src: image?.src }
  }, preview)
  assert.equal(image.loaded, true, 'The native SVG resource did not decode')
  assert.match(image.src ?? '', /^marklab-asset:\/\/local\/v1\//)
}

describe('native PlantUML previews', () => {
  it('renders a Markdown fence and a standalone file through the real Rust renderer', async () => {
    await switchToWorkspace(fixture.alpha)
    await openEditor('Diagram.md')
    await expectNativeImage()
    const pinned = await browser
      .$('[data-app-focus-zone="editor"]')
      .getAttribute('data-sidebar-pinned')
    if (pinned !== 'true') {
      await browser.$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-panel-left)').click()
    }
    await browser.$('button[data-file-tree-node]=Diagram.puml').waitForDisplayed()
    await browser.$('button[data-file-tree-node]=Diagram.puml').click()
    const sourceEditor = await browser.$('.monaco-editor')
    await sourceEditor.waitForDisplayed({ timeout: 45_000 })
    const before = await invokeNative('fs_open_buffer_snapshot', {
      path: 'Diagram.puml',
    })
    assert.match(before.content, /native-plantuml/)
    const toggle = 'button[aria-label*="PlantUML"][aria-pressed]'
    await browser.$(toggle).click()
    assert.equal(await browser.$(toggle).getAttribute('aria-pressed'), 'true')
    await expectNativeImage()
    assert.equal(await sourceEditor.isDisplayed(), false)
    await browser.$(toggle).click()
    await sourceEditor.waitForDisplayed()
    const after = await invokeNative('fs_open_buffer_snapshot', {
      path: 'Diagram.puml',
    })
    assert.equal(after.content, before.content, 'Preview switching changed the editor buffer')
    assert.equal(
      await fs.readFile(path.join(fixture.alpha, 'Diagram.puml'), 'utf8'),
      before.content,
    )
    await openEditor('Editor.md')
  })
})
