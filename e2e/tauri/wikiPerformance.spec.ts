/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Native profiling helpers stay outside production. */
import { fixturePaths } from './fixturePaths.js'
import { invokeNative, switchToWorkspace } from './nativeHarness.js'
import { readRendererMemory } from './rendererMemory.js'
import { workspaceGraphRequest } from '../../src/logic/knowledgeGraphRequest.js'
/* eslint-enable no-restricted-imports */

const surface = '[data-testid="knowledge-graph"]'
const memory = () => readRendererMemory(fixturePaths().root)

const sampleFrames = () =>
  browser.execute(() => {
    const state: { frames: number[]; last: number; running: boolean } = {
      frames: [],
      last: performance.now(),
      running: true,
    }
    const record = () => {
      if (!state.running) return
      const now = performance.now()
      state.frames.push(now - state.last)
      state.last = now
      requestAnimationFrame(record)
    }
    requestAnimationFrame(record)
    // Profiling state exists only in the test's window, never in shipped code.
    Object.assign(window, { __relationFrames: state })
  })
const finishFrames = () =>
  browser.execute(() => {
    const host = window as Window & { __relationFrames?: { frames: number[]; running: boolean } }
    const state = host.__relationFrames
    if (!state) throw new Error('Frame sampler did not start')
    state.running = false
    delete host.__relationFrames
    return { frames: state.frames, visibility: document.visibilityState }
  })

const exercise = async (mode: 'pan' | 'zoom') => {
  await sampleFrames()
  try {
    if (mode === 'pan') {
      const canvas = await browser.$(`${surface} canvas`)
      const [location, size] = await Promise.all([canvas.getLocation(), canvas.getSize()])
      const rect = { ...location, ...size }
      await browser
        .action('pointer')
        .move({ x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) })
        .down()
        .move({
          x: Math.round(rect.x + rect.width / 2 + 100),
          y: Math.round(rect.y + rect.height / 2 + 60),
          duration: 600,
        })
        .up()
        .perform()
    } else {
      const buttons = await browser.$$(`${surface} > div:last-of-type button`)
      assert.equal(buttons.length, 2, 'Graph zoom controls unavailable')
      await buttons[1]!.click()
      await buttons[0]!.click()
    }
  } finally {
    await browser.releaseActions()
  }
  return finishFrames()
}

describe('native relation graph profiling', () => {
  it('profiles bounded topology, first display, interaction and hidden lifecycle', async () => {
    await switchToWorkspace(fixturePaths().alpha)
    const initialMemory = await memory()
    const nativeStart = performance.now()
    const topology = await invokeNative('fs_get_workspace_graph', workspaceGraphRequest())
    const native = {
      ms: performance.now() - nativeStart,
      nodes: topology.nodes.length,
      edges: topology.edges.length,
      bytes: JSON.stringify(topology).length,
      truncated: topology.truncated,
    }
    assert.ok(native.nodes > 0)
    const started = Date.now()
    await browser.$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-network)').click()
    await browser.$(`${surface}[data-graph-renderer="sigma"]`).waitForDisplayed({ timeout: 90_000 })
    const openMs = Date.now() - started
    const firstLayoutMemory = await memory()
    const pan = await exercise('pan')
    const zoom = await exercise('zoom')
    const dom = await browser.execute(() => {
      const graph = document.querySelector('[data-testid="knowledge-graph"]')
      return {
        elements: graph?.querySelectorAll('*').length ?? 0,
        canvases: graph?.querySelectorAll('canvas').length ?? 0,
        nodes: Number(graph?.getAttribute('data-graph-node-count')),
        edges: Number(graph?.getAttribute('data-graph-edge-count')),
        width: graph?.clientWidth,
        height: graph?.clientHeight,
      }
    })
    assert.equal(dom.nodes, topology.nodes.length)
    assert.equal(dom.edges, topology.edges.length)
    assert.ok(dom.canvases > 0, 'Sigma did not create a rendering surface')
    const graphMemory = await memory()
    await browser.$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-files)').click()
    const hiddenMemory = await memory()
    console.info(
      'WIKI_GRAPH_PROFILE',
      JSON.stringify({
        native,
        initialMemory,
        openMs,
        firstLayoutMemory,
        pan,
        zoom,
        graphMemory,
        hiddenMemory,
        dom,
      }),
    )
  }).timeout(180_000)
})
