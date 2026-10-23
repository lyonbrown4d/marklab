/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { browser } from '@wdio/globals'
import type { LinkPreviewCapture } from '@/types/linkPreview'
import type { WebTabState } from '@/types/webTabs'
/* eslint-disable no-restricted-imports -- Isolated real-native acceptance fixtures. */
import { fixturePaths } from './fixturePaths.js'
import { switchToWorkspace } from './nativeHarness.js'
import { createWebTabFixture } from './webTabs.fixture.js'
/* eslint-enable no-restricted-imports */

describe('native browser session and live preview', () => {
  it('shares an HttpOnly login cookie with new and recreated native views', async () => {
    const site = await createWebTabFixture()
    try {
      await switchToWorkspace(fixturePaths().alpha)
      await browser.setTimeout({ script: 60_000 })
      const result = await browser.execute(async (base) => {
        const runtime = window.marklabTauri
        if (!runtime) throw new Error('Native runtime is unavailable')
        const states = new Map<string, WebTabState>()
        const stop = runtime.webTabs.onState((event) => {
          if (event.type === 'state') states.set(event.state.tabId, event.state)
        })
        const ids = ['auth-login', 'auth-account', 'auth-recreated']
        const activate = async (tabId: string, route: string) => {
          states.delete(tabId)
          await runtime.webTabs.activate({
            tabId,
            url: `${base}/${route}`,
            bounds: { x: 50, y: 100, width: 480, height: 320 },
          })
          const deadline = Date.now() + 15_000
          while (states.get(tabId)?.status !== 'ready') {
            if (Date.now() >= deadline) throw new Error(`Native login page did not load: ${route}`)
            await new Promise((resolve) => window.setTimeout(resolve, 25))
          }
        }
        try {
          await activate(ids[0]!, 'login')
          await activate(ids[1]!, 'account')
          for (const tabId of ids) await runtime.webTabs.close({ tabId })
          await activate(ids[2]!, 'account')
          await activate(ids[2]!, 'logout')
          return { passed: true }
        } catch (error) {
          return { error: String(error) }
        } finally {
          for (const tabId of ids) await runtime.webTabs.close({ tabId })
          stop()
        }
      }, site.base)
      assert.equal(result.error, undefined)
      assert.deepEqual(site.accounts, [true, true], 'New native views lost the login cookie')
    } finally {
      try {
        await browser.setTimeout({ script: 20_000 })
      } finally {
        await site.close()
      }
    }
  })

  it('publishes a changed native screenshot after reloading the same URL', async () => {
    const site = await createWebTabFixture({ refreshOnReload: true })
    try {
      await switchToWorkspace(fixturePaths().alpha)
      await browser.setTimeout({ script: 60_000 })
      // Keep the whole journey in one root invocation while child views exist.
      const result = await browser.execute(async (base) => {
        const runtime = window.marklabTauri
        if (!runtime) throw new Error('Native runtime is unavailable')
        const frames: LinkPreviewCapture[] = []
        let stop: (() => void) | undefined
        try {
          stop = await runtime.events.listen('link-preview-updated', ({ payload }) => {
            if (payload.capture.url === `${base}/preview`) frames.push(payload.capture)
          })
          const waitFrame = async (count: number) => {
            const deadline = Date.now() + 20_000
            while (frames.length < count) {
              if (Date.now() >= deadline) throw new Error(`Missing native preview frame ${count}`)
              await new Promise((resolve) => window.setTimeout(resolve, 25))
            }
            return frames[count - 1]!
          }
          await runtime.webTabs.activate({
            tabId: 'preview-refresh',
            url: `${base}/preview`,
            bounds: { x: 50, y: 100, width: 480, height: 320 },
          })
          const first = await waitFrame(1)
          await runtime.webTabs.reload({ tabId: 'preview-refresh' })
          const second = await waitFrame(2)
          const { platform } = await runtime.commands.invoke('app_get_platform')
          const digest = async (src: string) => {
            const assetUrl =
              platform === 'windows'
                ? src.replace('marklab-asset://', 'http://marklab-asset.localhost/')
                : src
            const response = await fetch(assetUrl)
            if (!response.ok) throw new Error(`Preview asset returned ${response.status}`)
            const bytes = await response.arrayBuffer()
            return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).join(
              ',',
            )
          }
          const [before, after] = await Promise.all([digest(first.src), digest(second.src)])
          return { changed: before !== after, width: second.width, height: second.height }
        } catch (error) {
          return { error: String(error) }
        } finally {
          stop?.()
          await runtime.webTabs.close({ tabId: 'preview-refresh' })
        }
      }, site.base)
      assert.equal(result.error, undefined)
      assert.equal(result.changed, true, 'Reload reused the old screenshot pixels')
      assert.equal(result.width, 1920)
      assert.equal(result.height, 1080)
    } finally {
      try {
        await browser.setTimeout({ script: 20_000 })
      } finally {
        await site.close()
      }
    }
  })
})
