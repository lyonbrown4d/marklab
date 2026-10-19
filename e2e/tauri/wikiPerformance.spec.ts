/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Real native performance fixture only. */
import { fixturePaths } from './fixturePaths.js'
import { switchToWorkspace } from './nativeHarness.js'
import { startReactProfile, stopReactProfile } from './reactProfile.js'
import { readRendererMemory } from './rendererMemory.js'
/* eslint-enable no-restricted-imports */

type InteractionSample = {
  frames: number[]
  changed: boolean
  visibility: string
  mode: 'pan' | 'zoom'
}

const memory = () => readRendererMemory(fixturePaths().root)

const exercise = async (mode: 'pan' | 'zoom') => {
  const sample = await browser.execute(
    (kind) =>
      new Promise<InteractionSample>((resolve) => {
        const pane = document.querySelector<HTMLElement>('.react-flow__pane')
        const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
        const result: InteractionSample = {
          frames: [],
          changed: false,
          visibility: document.visibilityState,
          mode: kind,
        }
        if (!pane || !viewport) return resolve(result)
        const rect = pane.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const before = viewport.style.transform
        let last = performance.now()
        const started = last
        let previousElapsed = 0
        let stopped = false
        const recordVisibility = () => {
          if (document.visibilityState !== 'visible') result.visibility = document.visibilityState
        }
        document.addEventListener('visibilitychange', recordVisibility)
        const finish = () => {
          if (stopped) return
          stopped = true
          recordVisibility()
          document.removeEventListener('visibilitychange', recordVisibility)
          if (kind === 'pan')
            window.dispatchEvent(
              new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1,
                clientX: x,
                clientY: y,
              }),
            )
          window.dispatchEvent(
            new MouseEvent('mouseup', { view: window, bubbles: true, clientX: x, clientY: y }),
          )
          resolve(result)
        }
        const timeout = window.setTimeout(finish, 10_000)
        if (kind === 'pan')
          pane.dispatchEvent(
            new MouseEvent('mousedown', {
              view: window,
              bubbles: true,
              cancelable: true,
              button: 0,
              buttons: 1,
              clientX: x,
              clientY: y,
            }),
          )
        const frame = (now: number) => {
          if (stopped) return
          result.frames.push(now - last)
          last = now
          const elapsed = Math.min(now - started, 2_000)
          if (kind === 'pan') {
            window.dispatchEvent(
              new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1,
                clientX: x + Math.sin(elapsed / 240) * 140,
                clientY: y + Math.cos(elapsed / 240) * 70,
              }),
            )
          } else {
            pane.dispatchEvent(
              new WheelEvent('wheel', {
                view: window,
                bubbles: true,
                cancelable: true,
                ctrlKey: true,
                // Feed the same time-based zoom path at any refresh rate. A fixed
                // delta per frame would zoom farther on the faster implementation.
                deltaY:
                  (Math.cos((elapsed * Math.PI) / 1_000) -
                    Math.cos((previousElapsed * Math.PI) / 1_000)) *
                  48,
                clientX: x,
                clientY: y,
              }),
            )
          }
          previousElapsed = elapsed
          result.changed ||= viewport.style.transform !== before
          if (elapsed < 2_000) requestAnimationFrame(frame)
          else {
            clearTimeout(timeout)
            finish()
          }
        }
        requestAnimationFrame(frame)
      }),
    mode,
  )
  assert.equal(sample.visibility, 'visible', 'Native profile window must remain visible')
  assert.ok(sample.frames.length > 10, 'No valid animation-frame sample was collected')
  assert.ok(sample.changed, `${mode} never changed the real React Flow viewport`)
  const frames = sample.frames.slice(1).sort((a, b) => a - b)
  return {
    frames: frames.length,
    p50: frames[Math.floor(frames.length * 0.5)],
    p95: frames[Math.floor(frames.length * 0.95)],
    max: frames.at(-1),
    over50ms: frames.filter((value) => value > 50).length,
  }
}

const probeLayers = async () => {
  const samples = []
  const canvasEdges = await browser.execute(
    () => document.querySelector('canvas.workspace-map-overview-edges') !== null,
  )
  try {
    for (const [name, css] of [
      ['normal', ''],
      [
        'without-edge-paint',
        '.workspace-map-canvas :is(.react-flow__edges,.workspace-map-overview-edges) {display:none!important}',
      ],
      [
        'fast-edge-paint',
        '.workspace-map-canvas .react-flow__edge-path {shape-rendering:optimizeSpeed!important}',
      ],
      [
        'flat-groups',
        '.workspace-map-group-region {isolation:auto!important;contain:none!important;opacity:1!important}',
      ],
    ]) {
      if (canvasEdges && name === 'fast-edge-paint') continue
      await browser.execute((text) => {
        let style = document.querySelector<HTMLStyleElement>('#wiki-profile-layers')
        if (!style) {
          style = document.createElement('style')
          style.id = 'wiki-profile-layers'
          document.head.append(style)
        }
        style.textContent = text
      }, css)
      samples.push({ name, pan: await exercise('pan'), zoom: await exercise('zoom') })
    }
    return samples
  } finally {
    await browser.execute(() => document.querySelector('#wiki-profile-layers')?.remove())
  }
}

describe('workspace graph performance profile', () => {
  it('measures native graph payload, interaction frames and WebContent RSS', async () => {
    await switchToWorkspace(fixturePaths().alpha)
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document.visibilityState === 'visible' &&
            !document.querySelector('.window-presentation-pending'),
        ),
      { timeout: 30_000, timeoutMsg: 'Native profile owner was never presented' },
    )
    const initialMemory = await memory()
    const native = await browser.execute(async () => {
      const runtime = window.marklabTauri
      if (!runtime) return null
      const started = performance.now()
      return runtime.commands
        .invoke<{ nodes: unknown[]; edges: unknown[] }>('fs_get_workspace_graph')
        .then(
          (graph) => ({
            ms: performance.now() - started,
            nodes: graph.nodes.length,
            edges: graph.edges.length,
            bytes: JSON.stringify(graph).length,
          }),
          () => null,
        )
    })
    assert.ok(native)
    const started = Date.now()
    await browser.$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-network)').click()
    const canvas = await browser.$('.workspace-map-canvas')
    await canvas.waitForDisplayed({ timeout: 90_000 })
    await browser.waitUntil(
      async () => browser.execute(() => document.querySelectorAll('.react-flow__node').length > 0),
      {
        timeout: 90_000,
      },
    )
    const openMs = Date.now() - started
    const profileReact = process.env.MARKLAB_E2E_REACT_PROFILE === '1'
    if (profileReact) await startReactProfile()
    const pan = await exercise('pan')
    const zoom = await exercise('zoom')
    const react = profileReact ? await stopReactProfile() : undefined
    const graphMemory = await memory()
    const dom = await browser.execute(() => ({
      elements: document.querySelectorAll('*').length,
      viewportWidth: document.querySelector('.workspace-map-canvas')?.clientWidth,
      viewportHeight: document.querySelector('.workspace-map-canvas')?.clientHeight,
      renderedNodes: document.querySelectorAll('.react-flow__node').length,
      renderedEdges: document.querySelectorAll('.react-flow__edge').length,
      svgEdgePaths: document.querySelectorAll('.react-flow__edge-path[d]').length,
      edgeSurfaces: document.querySelectorAll(
        '.react-flow__edges svg, .workspace-map-overview-edges',
      ).length,
      graphElements: document.querySelectorAll('.workspace-map-canvas *').length,
      edgeHitAreas: document.querySelectorAll('.react-flow__edge-interaction').length,
      miniMapNodes: document.querySelectorAll('.react-flow__minimap-node').length,
      regions: document.querySelectorAll('.workspace-map-group-region').length,
      regionArea: [...document.querySelectorAll<HTMLElement>('.workspace-map-group-region')].reduce(
        (sum, element) => sum + element.offsetWidth * element.offsetHeight,
        0,
      ),
      collapsedCards: document.querySelectorAll('[data-workspace-map-collapsed]').length,
      transform: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
    }))
    assert.ok(dom.renderedEdges > 0, 'The sampled graph lost its visible relations')
    // The layout worker has a 30-second idle lifetime. Include a settled sample
    // rather than treating its short-lived peak as permanent renderer memory.
    await browser.waitUntil(async () => Date.now() - started >= 36_000, {
      timeout: 45_000,
      interval: 1_000,
    })
    const settledMemory = await memory()
    const settledInteraction = { pan: await exercise('pan'), zoom: await exercise('zoom') }
    const layers = process.env.MARKLAB_E2E_RENDER_LAYERS === '1' ? await probeLayers() : undefined
    // Read pixels after frame/memory sampling so verification does not affect it.
    const raster = await browser.execute(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      const canvas = document.querySelector<HTMLCanvasElement>(
        'canvas.workspace-map-overview-edges',
      )
      if (!canvas) return null
      const context = canvas.getContext('2d')
      if (!context || !canvas.width || !canvas.height)
        return { width: canvas.width, height: canvas.height, paintedPixels: 0 }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let paintedPixels = 0
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) paintedPixels += 1
      return { width: canvas.width, height: canvas.height, paintedPixels }
    })
    assert.ok(
      dom.svgEdgePaths > 0 || (raster?.paintedPixels ?? 0) > 0,
      'The graph has no drawn relation geometry',
    )
    console.info(
      'WIKI_GRAPH_PROFILE',
      JSON.stringify({
        native,
        initialMemory,
        openMs,
        pan,
        zoom,
        graphMemory,
        settledMemory,
        settledInteraction,
        dom,
        layers,
        raster,
        react,
      }),
    )
  })
})
