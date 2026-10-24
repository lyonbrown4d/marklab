/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Native acceptance helpers only. */
import { fixturePaths } from './fixturePaths.js'
import { openEditor, switchToWorkspace } from './nativeHarness.js'
import { assertWindowButtonsAligned } from './windowButtons.js'
/* eslint-enable no-restricted-imports */

const fixture = fixturePaths()
const titlebar = '[data-app-focus-zone="titlebar"]'
const sidebarButton = `${titlebar} button:has(svg.lucide-panel-left)`

const isMaximized = () =>
  browser.execute(async () => {
    if (!window.marklabTauri) throw new Error('The real Tauri window API is unavailable')
    return window.marklabTauri.window.isMaximized()
  })

const unmaximize = () =>
  browser.execute(async () => {
    if (!window.marklabTauri) throw new Error('The real Tauri window API is unavailable')
    await window.marklabTauri.window.unmaximize()
  })

const setFullscreen = async (fullscreen: boolean) => {
  await browser.execute(async (enabled) => {
    const host = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, payload: { request: { fullscreen: boolean } }) => Promise<void>
      }
    }
    await host.__TAURI_INTERNALS__.invoke('window_set_fullscreen', {
      request: { fullscreen: enabled },
    })
  }, fullscreen)
}

const doubleClick = (selector: string) =>
  browser.execute((targetSelector) => {
    const target = document.querySelector(targetSelector)
    if (!target) throw new Error(`Missing titlebar double-click target: ${targetSelector}`)
    // The embedded driver's click uses HTMLElement.click(), while pointer actions
    // do not synthesize a counted second press. Exercise the real React handlers
    // at the same press/release coordinates, following Tauri's platform timing.
    const event = { bubbles: true, button: 0, detail: 2, clientX: 100, clientY: 20 }
    target.dispatchEvent(new MouseEvent('mousedown', event))
    target.dispatchEvent(new MouseEvent('mouseup', event))
  }, selector)

const waitForMaximized = (expected: boolean) =>
  browser.waitUntil(async () => (await isMaximized()) === expected, {
    timeout: 10_000,
    timeoutMsg: `Titlebar double click did not ${expected ? 'maximize' : 'restore'} the native window`,
  })

const assertControlsKeepGeometry = async (selector: string) => {
  const before = await browser.getWindowRect()
  await doubleClick(selector)
  // Check throughout a bounded settling interval, so a delayed native resize
  // cannot pass merely because the first isMaximized query won an IPC race.
  const stayedRestored = await browser.execute(async () => {
    const runtime = window.marklabTauri
    if (!runtime) throw new Error('The real Tauri window API is unavailable')
    const deadline = performance.now() + 600
    do {
      if (await runtime.window.isMaximized()) return false
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    } while (performance.now() < deadline)
    return true
  })
  assert.equal(
    stayedRestored,
    true,
    `An interactive titlebar target resized the window: ${selector}`,
  )
  assert.deepEqual(await browser.getWindowRect(), before, 'Interactive titlebar geometry changed')
}

describe('native titlebar double click', () => {
  it('maximizes and restores the real window while excluding buttons and their SVG descendants', async () => {
    await switchToWorkspace(fixture.alpha)
    await openEditor()
    await assertWindowButtonsAligned(fixture.alpha)
    await unmaximize()
    await waitForMaximized(false)
    const original = await browser.getWindowRect()
    try {
      await browser.setWindowRect(120, 140, 900, 700)
      const restored = await browser.getWindowRect()
      assert.equal(await isMaximized(), false)
      await assertWindowButtonsAligned(fixture.alpha)

      await doubleClick(titlebar)
      await waitForMaximized(true)
      const maximized = await browser.getWindowRect()
      assert.ok(
        maximized.width !== restored.width || maximized.height !== restored.height,
        'Native maximization did not change the actual window size',
      )

      await doubleClick(titlebar)
      await waitForMaximized(false)
      await browser.waitUntil(
        async () => {
          const current = await browser.getWindowRect()
          return (
            Math.abs(current.width - restored.width) <= 1 &&
            Math.abs(current.height - restored.height) <= 1
          )
        },
        { timeoutMsg: 'Restoring the titlebar did not restore the original native dimensions' },
      )

      await assertControlsKeepGeometry(sidebarButton)
      await assertWindowButtonsAligned(fixture.alpha)
      await assertControlsKeepGeometry(`${sidebarButton} svg`)
      await assertControlsKeepGeometry(`${sidebarButton} svg path`)
      if (process.platform === 'darwin') {
        await setFullscreen(true)
        await browser.waitUntil(
          async () => (await browser.getWindowRect()).height > restored.height,
        )
        await setFullscreen(false)
        await browser.waitUntil(
          async () => Math.abs((await browser.getWindowRect()).height - restored.height) <= 1,
        )
        await assertWindowButtonsAligned(fixture.alpha)
      }
    } finally {
      if (process.platform === 'darwin') await setFullscreen(false)
      await unmaximize()
      await waitForMaximized(false)
      await browser.setWindowRect(original.x, original.y, original.width, original.height)
    }
  })
})
