/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { browser } from '@wdio/globals'
import { Key } from 'webdriverio'
/* eslint-disable no-restricted-imports -- Native keyboard regression only. */
import { fixturePaths } from './fixturePaths.js'
import {
  invokeNative,
  openEditor,
  switchToWorkspace,
  typeAtEditorEnd,
  waitForRustMarker,
} from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

describe('native block selection focus', () => {
  it('retains Select All after the old text caret blurs and keeps subsequent typing usable', async () => {
    await switchToWorkspace(fixturePaths().alpha)
    await openEditor()
    await typeAtEditorEnd(' native-selection-marker')
    await waitForRustMarker('native-selection-marker')
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Control, 'A'])
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const blocks = [
            ...document.querySelectorAll(
              '[data-testid="markdown-editor"] [data-block-drag-wrapper="true"]',
            ),
          ]
          return (
            blocks.length >= 2 &&
            blocks.every((block) => block.getAttribute('data-block-selected') === 'true')
          )
        }),
      { timeoutMsg: 'Select All was cleared after moving focus to the block input' },
    )
    // Cover Slate's deferred DOM-selection update, not just the first render.
    await browser.execute(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })
    assert.ok(
      await browser.execute(() => {
        const blocks = [
          ...document.querySelectorAll(
            '[data-testid="markdown-editor"] [data-block-drag-wrapper="true"]',
          ),
        ]
        return (
          blocks.length >= 2 &&
          blocks.every((block) => block.getAttribute('data-block-selected') === 'true')
        )
      }),
    )
    await browser.keys(Key.Escape)
    await browser.waitUntil(() =>
      browser.execute(() => document.querySelectorAll('[data-block-selected="true"]').length === 0),
    )
    await typeAtEditorEnd(' native-selection-resumed')
    await waitForRustMarker('native-selection-resumed')
    await invokeNative('fs_flush_buffers')
  })
})
