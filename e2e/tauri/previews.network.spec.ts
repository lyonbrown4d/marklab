/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Optional native network acceptance only. */
import { fixturePaths } from './fixturePaths.js'
import { invokeNative, switchToWorkspace } from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

type PreviewJourney = { reused?: boolean; images?: boolean; error?: string }

describe('native preview worker reuse (public network)', () => {
  it('reuses a cleared worker for distinct URLs and releases it with its owner', async () => {
    // Kept separate from offline acceptance: preview SSRF guards deliberately
    // reject loopback servers, so the real fetch/snapshot path needs the internet.
    const fixture = fixturePaths()
    await switchToWorkspace(fixture.alpha)
    await invokeNative('open_path_in_new_window', { path: fixture.beta })
    await switchToWorkspace(fixture.beta)
    const owner = await browser.getWindowHandle()
    await browser.setTimeout({ script: 60_000 })
    const result = await browser.executeAsync<PreviewJourney, []>((done) => {
      const runtime = window.marklabTauri
      if (!runtime) return done({ error: 'Native runtime is unavailable' })
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (name: string) => Promise<Array<{ label: string }>>
          }
        }
      ).__TAURI_INTERNALS__
      const workers = () =>
        internals.invoke('plugin:webview|get_all_webviews').then((views) =>
          views
            .filter((view) => view.label.startsWith('capture-'))
            .map((view) => view.label)
            .sort(),
        )
      void (async () => {
        let outcome: PreviewJourney
        try {
          const capture = (url: string) =>
            runtime.linkPreview.capture(url, {
              requestId: crypto.randomUUID(),
              priority: 'interactive',
            })
          const nonce = crypto.randomUUID()
          const first = await capture(`https://example.com/?marklab-preview=${nonce}-first`)
          const firstWorkers = await workers()
          const second = await capture(`https://example.com/?marklab-preview=${nonce}-second`)
          const secondWorkers = await workers()
          outcome = {
            reused: firstWorkers.length === 1 && firstWorkers.join() === secondWorkers.join(),
            images: [first, second].every(
              (image) =>
                image.width === 1920 &&
                image.height === 1080 &&
                image.src.startsWith('marklab-asset://remote/v1/'),
            ),
          }
        } catch (error) {
          outcome = { error: String(error) }
        }
        done(outcome)
        // Use the production close handshake to exercise queue cancellation,
        // worker reclamation and owner-scoped capability cleanup as well.
        window.setTimeout(() => {
          void runtime.window.close().catch(console.error)
        }, 0)
      })().catch((error: unknown) => done({ error: String(error) }))
    })
    await browser.waitUntil(async () => !(await browser.getWindowHandles()).includes(owner), {
      timeout: 30_000,
      timeoutMsg: 'Preview owner failed to close and release its native child',
    })
    await switchToWorkspace(fixture.alpha)
    assert.equal(result.error, undefined)
    assert.equal(result.images, true)
    assert.equal(result.reused, true)
  })
})
