/// <reference types="mocha" />
import assert from 'node:assert/strict'
import http from 'node:http'
import { browser } from '@wdio/globals'
import type { WebTabState } from '@/types/webTabs'
/* eslint-disable no-restricted-imports -- Native E2E helpers never enter production bundles. */
import { fixturePaths } from './fixturePaths.js'
import { switchToWorkspace } from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

type PoolJourney = { counts?: number[]; reused?: boolean; error?: string }

describe('native webpage residents', () => {
  it('reuses assigned views and reloads an evicted least recently used tab', async () => {
    const requests = new Map<string, number>()
    const server = http.createServer((request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      requests.set(pathname, (requests.get(pathname) ?? 0) + 1)
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>Native pool fixture</title><p>Local fixture.</p>')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      assert.ok(address && typeof address !== 'string')
      await switchToWorkspace(fixturePaths().alpha)
      await browser.setTimeout({ script: 60_000 })
      // The embedded driver enumerates WebviewWindows, which temporarily omits
      // a root with child views. Complete this journey in one root invocation;
      // all children are closed before another WebDriver request is issued.
      const result = await browser.executeAsync<PoolJourney, [string]>((base, done) => {
        const runtime = window.marklabTauri
        if (!runtime) return done({ error: 'Native runtime is unavailable' })
        const host = window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (command: string) => Promise<Array<{ label: string }>>
          }
        }
        const states = new Map<string, WebTabState>()
        const unsubscribe = runtime.webTabs.onState((event) => {
          if (event.type === 'state') states.set(event.state.tabId, event.state)
        })
        const ids = ['pool-one', 'pool-two', 'pool-three', 'pool-four']
        const residentCounts: number[] = []
        const labels = () =>
          host.__TAURI_INTERNALS__.invoke('plugin:webview|get_all_webviews').then((views) =>
            views
              .filter((view) => view.label.startsWith('tab-'))
              .map((view) => view.label)
              .sort(),
          )
        const activate = async (id: string) => {
          states.delete(id)
          await runtime.webTabs.activate({
            bounds: { x: 50, y: 100, width: 480, height: 320 },
            tabId: id,
            url: `${base}/${id}`,
          })
          const deadline = Date.now() + 10_000
          while (states.get(id)?.status !== 'ready') {
            if (Date.now() >= deadline) throw new Error(`Native page did not load: ${id}`)
            if (states.get(id)?.status === 'error') throw new Error(`Native page failed: ${id}`)
            await new Promise((resolve) => window.setTimeout(resolve, 25))
          }
          const current = await labels()
          residentCounts.push(current.length)
          return current
        }
        void (async () => {
          let outcome: PoolJourney
          try {
            await activate(ids[0]!)
            await activate(ids[1]!)
            const before = await activate(ids[2]!)
            const after = await activate(ids[0]!)
            await activate(ids[3]!)
            await activate(ids[1]!)
            outcome = { counts: residentCounts, reused: before.join() === after.join() }
          } catch (error) {
            outcome = { error: String(error) }
          } finally {
            for (const tabId of ids) await runtime.webTabs.close({ tabId })
            unsubscribe()
          }
          done(outcome)
        })().catch((error: unknown) => done({ error: String(error) }))
      }, `http://127.0.0.1:${address.port}`)
      assert.equal(result.error, undefined)
      assert.equal(result.reused, true)
      assert.deepEqual(result.counts, [1, 2, 3, 3, 3, 3])
      assert.equal(requests.get('/pool-one'), 1)
      assert.equal(requests.get('/pool-two'), 2)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})
