/// <reference types="mocha" />
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Native UI acceptance uses only generated documents. */
import { fixturePaths } from './fixturePaths.js'
import { openEditor, switchToWorkspace } from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

describe('native floating webpage tabs', () => {
  it('keeps navigation usable without a tab spacer and restores the native page after collapse', async () => {
    const fixture = fixturePaths()
    const original = await browser.getWindowRect()
    try {
      await fs.writeFile(
        path.join(fixture.alpha, 'NativeWeb.md'),
        // The UI accepts HTTPS. A reserved, unreachable origin keeps geometry
        // acceptance independent of network responses; loaded pixels are
        // verified separately by the real loopback snapshot journey.
        '# Native browser\n\n[Native web fixture](https://layout.marklab.invalid/)\n',
      )
      await switchToWorkspace(fixture.alpha)
      await browser.setTimeout({ script: 60_000 })
      for (const width of [900, 640]) {
        await browser.setWindowRect(120, 140, width, 700)
        await openEditor('NativeWeb.md')
        const result = await browser.execute(async () => {
          const wait = async (condition: () => boolean, message: string) => {
            const deadline = Date.now() + 20_000
            while (!condition()) {
              if (Date.now() >= deadline) throw new Error(message)
              await new Promise((resolve) => window.setTimeout(resolve, 25))
            }
          }
          const startRoute = window.location.hash
          const runtime = window.marklabTauri
          if (!runtime) throw new Error('Native runtime is unavailable')
          let nativeTabId: string | undefined
          const stop = runtime.webTabs.onState((event) => {
            if (event.type === 'state' && event.state.active) nativeTabId = event.state.tabId
          })
          let close: HTMLButtonElement | undefined
          try {
            if (document.querySelector('[data-sidebar-pinned="true"]')) {
              document
                .querySelector<HTMLButtonElement>(
                  '[data-app-focus-zone="titlebar"] button:has(svg.lucide-panel-left)',
                )
                ?.click()
            }
            const open = document.querySelector<HTMLButtonElement>(
              '[data-marklab-editor-chrome="external-link-preview"] button:has(svg.lucide-app-window)',
            )
            if (!open) throw new Error('The webpage preview has no Open in app action')
            open.click()
            await wait(
              () =>
                document.querySelector<HTMLElement>('[data-testid="web-tab-native-host"]')?.dataset
                  .nativeActive === 'true',
              'Native webpage never became active',
            )
            if (document.visibilityState !== 'visible')
              throw new Error('Native test window is not in the foreground')
            const host = document.querySelector<HTMLElement>('[data-testid="web-tab-native-host"]')!
            const surface = host.closest('section')!
            const toolbar = surface.querySelector<HTMLElement>('[role="toolbar"]')!
            const buttons = toolbar.querySelectorAll<HTMLButtonElement>('button')
            close = buttons.item(buttons.length - 1)
            const handle = document.querySelector<HTMLButtonElement>(
              '[data-testid="tabs-dock"] button[aria-expanded]',
            )
            const address = toolbar.querySelector<HTMLInputElement>('input')
            if (!handle || !address || !close)
              throw new Error('Web navigation controls are missing')
            const geometry = () => {
              const bounds = host.getBoundingClientRect()
              return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
            }
            // Wait for the existing sidebar transition rather than accepting an intermediate size.
            let stable = 0
            let previous = ''
            await wait(() => {
              const current = JSON.stringify(geometry())
              stable = current === previous ? stable + 1 : 0
              previous = current
              return stable >= 4
            }, 'Native host geometry never settled')
            const before = geometry()
            const nav = toolbar.getBoundingClientRect()
            const input = address.getBoundingClientRect()
            const trigger = handle.getBoundingClientRect()
            const spacer = nav.top - surface.getBoundingClientRect().top
            handle.click()
            await wait(
              () => host.dataset.nativeActive === 'false',
              'Expanded tabs did not hide the native page',
            )
            const expanded = geometry()
            const list = document.querySelector<HTMLElement>(
              '[data-testid="tabs-dock"] [role="tablist"]',
            )
            const floating = Boolean(list && list.getBoundingClientRect().height > 0)
            if (innerWidth > 700) {
              const selected = list?.querySelector<HTMLElement>(
                '[role="tab"][aria-selected="true"]',
              )
              if (!selected) throw new Error('Floating tabs have no selected webpage')
              selected.click()
            } else {
              handle.click()
            }
            await wait(
              () => host.dataset.nativeActive === 'true',
              'Selecting or collapsing tabs did not restore the native page',
            )
            return {
              spacer,
              before,
              expanded,
              after: geometry(),
              floating,
              addressWidth: input.width,
              overlap: input.right - trigger.left,
            }
          } catch (error) {
            return {
              failure: {
                message: String(error),
                width: innerWidth,
                expanded: document
                  .querySelector('[data-testid="tabs-dock"] button[aria-expanded]')
                  ?.getAttribute('aria-expanded'),
                native: document.querySelector<HTMLElement>('[data-testid="web-tab-native-host"]')
                  ?.dataset,
                focused: document.activeElement?.outerHTML.slice(0, 400),
              },
            }
          } finally {
            close?.click()
            if (!close) window.location.hash = startRoute
            if (nativeTabId) await runtime.webTabs.close({ tabId: nativeTabId })
            stop()
            await wait(
              () => window.location.hash === startRoute,
              'Closing the webpage did not restore the document',
            )
          }
        })
        assert.equal(result.failure, undefined, JSON.stringify(result.failure))
        assert.ok(
          Math.abs(result.spacer ?? Infinity) <= 1,
          'The page reserves a separate row for tabs',
        )
        assert.equal(result.floating, true)
        assert.ok(
          (result.addressWidth ?? 0) >= 120,
          'The floating handle obscures the address input',
        )
        assert.ok(
          (result.overlap ?? Infinity) <= 1,
          'Address input overlaps the floating tab handle',
        )
        assert.deepEqual(
          result.expanded,
          result.before,
          'Expanding tabs moved the native page host',
        )
        assert.deepEqual(result.after, result.before, 'Collapsing tabs moved the native page host')
      }
    } finally {
      await browser.setTimeout({ script: 20_000 })
      await browser.setWindowRect(original.x, original.y, original.width, original.height)
    }
  })
})
