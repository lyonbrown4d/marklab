/// <reference types="mocha" />
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { browser } from '@wdio/globals'
import { z } from 'zod'
/* eslint-disable no-restricted-imports -- Isolated native cache validation only. */
import { fixturePaths } from './fixturePaths.js'
import { switchToWorkspace } from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

const requestSchema = z.object({
  engineVersion: z.string(),
  graphRevision: z.string(),
  layoutKey: z.literal('workspace-map:overview'),
  mode: z.literal('overview'),
})
const storedSchema = requestSchema.extend({ workspaceKey: z.string() })
type LayoutRequest = z.infer<typeof requestSchema>
type Trace = {
  overflow: boolean
  workers: string[]
  gets: { request: LayoutRequest; match: string | null; nodeCount: number }[]
  saves: LayoutRequest[]
  restore: () => void
}
type ObservedWindow = Window & { __warmLayoutTrace?: Trace }

const readStored = () => {
  const database = new DatabaseSync(
    path.join(fixturePaths().data, 'v1/tauri-storage/marklab.sqlite'),
    { readOnly: true },
  )
  try {
    const rows = database
      .prepare(
        'SELECT workspace_key AS workspaceKey, layout_key AS layoutKey, graph_revision AS graphRevision, engine_version AS engineVersion, mode FROM graph_layouts WHERE layout_key=?',
      )
      .all('workspace-map:overview')
    assert.equal(rows.length, 1, 'Expected one real persisted overview layout')
    const stored = storedSchema.parse(rows[0])
    const row = database
      .prepare('SELECT COUNT(*) AS count FROM graph_nodes WHERE workspace_key=? AND layout_key=?')
      .get(stored.workspaceKey, stored.layoutKey)
    assert.ok(typeof row?.count === 'number' && row.count > 0)
    return { ...stored, nodeCount: row.count }
  } finally {
    database.close()
  }
}

const readTrace = () =>
  browser.execute(() => {
    const trace = (window as ObservedWindow).__warmLayoutTrace
    if (!trace) throw new Error('No native warm layout observation')
    return {
      overflow: trace.overflow,
      workers: trace.workers,
      gets: trace.gets,
      saves: trace.saves,
    }
  })

describe('real warm Rust graph layout cache', () => {
  it('keeps persisted layout exact across fresh renderers and observes real ELK construction', async () => {
    const phase = z
      .enum(['seed', 'baseline', 'current'])
      .parse(process.env.MARKLAB_E2E_WARM_GRAPH_PHASE)
    const fixture = fixturePaths()
    const seedPath = path.join(fixture.root, 'warm-layout-seed.json')
    await switchToWorkspace(fixture.alpha)
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document.visibilityState === 'visible' &&
            !document.querySelector('.window-presentation-pending'),
        ),
      { timeout: 30_000, timeoutMsg: 'Warm cache owner must remain visible' },
    )
    assert.equal(await browser.execute(() => location.hash.includes('/workspace/graph')), false)
    const seed =
      phase === 'seed' ? null : requestSchema.parse(JSON.parse(await fs.readFile(seedPath, 'utf8')))
    if (seed) assert.deepEqual(requestSchema.parse(readStored()), seed)

    await browser.execute(() => {
      const host = window as ObservedWindow
      const runtime = window.marklabTauri
      if (!runtime) throw new Error('Native runtime unavailable')
      const OriginalWorker = window.Worker
      const originalInvoke = runtime.commands.invoke
      const trace: Trace = {
        overflow: false,
        workers: [],
        gets: [],
        saves: [],
        restore: () => {
          window.Worker = OriginalWorker
          runtime.commands.invoke = originalInvoke
        },
      }
      const request = (payload: unknown): LayoutRequest => {
        if (!payload || typeof payload !== 'object') throw new Error('Missing layout request')
        const value = payload as LayoutRequest
        return {
          engineVersion: value.engineVersion,
          graphRevision: value.graphRevision,
          layoutKey: value.layoutKey,
          mode: value.mode,
        }
      }
      window.Worker = new Proxy(OriginalWorker, {
        construct: (target, args, newTarget) => {
          const worker = Reflect.construct(target, args, newTarget)
          if (trace.workers.length >= 32) trace.overflow = true
          else trace.workers.push(new URL(String(args[0]), location.href).pathname)
          return worker
        },
      })
      runtime.commands.invoke = new Proxy(originalInvoke, {
        apply: (target, receiver, args) => {
          const promise = Reflect.apply(target, receiver, args) as Promise<unknown>
          const [command, payload] = args
          if (
            command !== 'fs_get_workspace_graph_layout' &&
            command !== 'fs_save_workspace_graph_layout'
          )
            return promise
          return promise.then((result) => {
            if (trace.gets.length + trace.saves.length >= 64) {
              trace.overflow = true
              return result
            }
            const metadata = request(payload)
            if (command === 'fs_save_workspace_graph_layout') trace.saves.push(metadata)
            else {
              const value = result as { match?: unknown; nodes?: unknown }
              trace.gets.push({
                request: metadata,
                match: typeof value.match === 'string' ? value.match : null,
                nodeCount: Array.isArray(value.nodes) ? value.nodes.length : 0,
              })
            }
            return result
          })
        },
      })
      host.__warmLayoutTrace = trace
    })

    try {
      const button = await browser.$(
        '[data-app-focus-zone="titlebar"] button:has(svg.lucide-network)',
      )
      // Explicit DOM focus exercises the real onFocus preload even if the embedded
      // driver's click does not synthesize a pointer-enter event.
      await button.execute((element) => element.focus())
      await button.click()
      await browser.$('.workspace-map-canvas').waitForDisplayed({ timeout: 90_000 })
      await browser.waitUntil(async () => (await readTrace()).gets.length > 0, { timeout: 20_000 })
      if (phase === 'seed') {
        await browser.waitUntil(async () => (await readTrace()).saves.length > 0, {
          timeout: 20_000,
        })
      } else if (phase === 'baseline') {
        await browser.waitUntil(
          async () => (await readTrace()).workers.some((url) => /\/elk-worker[.-]/.test(url)),
          {
            timeout: 20_000,
            timeoutMsg: 'Baseline focus did not create its real preloaded ELK worker',
          },
        )
      }
      // Allow queued module evaluation after focus without changing any layout result.
      await browser.pause(500)
      const trace = await readTrace()
      assert.equal(trace.overflow, false)
      assert.equal(await browser.execute(() => document.visibilityState), 'visible')
      const elkWorkers = trace.workers.filter((url) => /\/elk-worker[.-]/.test(url))
      const latest = trace.gets.at(-1)
      assert.ok(latest)
      const request = requestSchema.parse(latest.request)
      if (phase === 'seed') {
        assert.equal(latest.match, 'miss')
        assert.ok(elkWorkers.length > 0, 'Cold layout must prove the real Worker observer is live')
        assert.ok(trace.saves.some((saved) => saved.graphRevision === request.graphRevision))
        await fs.writeFile(seedPath, JSON.stringify(request))
      } else {
        assert.deepEqual(request, seed, 'Warm UI requested a different persisted graph revision')
        assert.ok(
          trace.gets.every((entry) => entry.match === 'exact'),
          'Warm UI must use the real Rust cache',
        )
        assert.ok(latest.nodeCount > 0)
        assert.equal(elkWorkers.length, phase === 'baseline' ? 1 : 0)
      }
      assert.deepEqual(requestSchema.parse(readStored()), request)
      const native = await browser.execute(
        async (value) =>
          window.marklabTauri!.commands.invoke<{ match: string; nodes: unknown[] }>(
            'fs_get_workspace_graph_layout',
            value,
          ),
        request,
      )
      assert.equal(native.match, 'exact')
      assert.ok(native.nodes.length > 0)
      console.info(
        'WARM_GRAPH_LAYOUT',
        JSON.stringify({
          phase,
          match: latest.match,
          request,
          elkWorkers: elkWorkers.length,
          storedNodes: readStored().nodeCount,
        }),
      )
      await browser.$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-files)').click()
      await browser.waitUntil(
        () => browser.execute(() => !location.hash.includes('/workspace/graph')),
        { timeout: 20_000 },
      )
    } finally {
      await browser.execute(() => {
        const host = window as ObservedWindow
        host.__warmLayoutTrace?.restore()
        delete host.__warmLayoutTrace
      })
    }
  })
})
