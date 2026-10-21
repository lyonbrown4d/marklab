/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { browser } from '@wdio/globals'
import { Key } from 'webdriverio'
import type { GraphCommunity } from '@/services/graphComputeApi'
/* eslint-disable no-restricted-imports -- Real native acceptance helpers only. */
import { fixturePaths } from './fixturePaths.js'
import {
  invokeNative,
  switchToWorkspace,
  typeAtEditorEnd,
  waitForRustMarker,
} from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

const fixture = fixturePaths()
const canvas = '[data-graph-view-id]'
const editor = '[data-testid="markdown-editor"][data-state="ready"]'
const modifier = process.platform === 'darwin' ? Key.Command : Key.Control
const tab = (id: string) => `[role="tab"][data-graph-tab-id="${id}"]`
const node = (id: string) => `.react-flow__node[data-id="${id}"]`

const readCanvas = () =>
  browser.execute(() => {
    const surface = document.querySelector('[data-graph-view-id]')
    return {
      count: Number(surface?.getAttribute('data-graph-node-count') ?? 0),
      view: surface?.getAttribute('data-graph-view-id'),
      canvases: document.querySelectorAll('.workspace-map-canvas').length,
      nodes: [...document.querySelectorAll('.react-flow__node')].map((item) =>
        item.getAttribute('data-id'),
      ),
    }
  })

const expectView = async (id: string, ids: string[]) => {
  await browser.waitUntil(
    async () => {
      const state = await readCanvas()
      return state.view === id && state.count === ids.length && state.nodes.length > 0
    },
    { timeout: 90_000, timeoutMsg: `Native graph never rendered view ${id}` },
  )
  assert.equal(await browser.$(tab(id)).getAttribute('aria-selected'), 'true')
  const state = await readCanvas()
  assert.equal(state.canvases, 1, 'Tab switching mounted more than one graph Canvas')
  const expected = new Set(ids)
  // React Flow virtualizes offscreen cards. Check the full assigned count above
  // and every mounted node against the real native partition, without disabling it.
  assert.ok(
    state.nodes.every((id) => id !== null && expected.has(id)),
    'Wrong tab node set',
  )
}

const chooseTab = async (community: GraphCommunity) => {
  await browser.$(tab(community.id)).click()
  // Manual Radix tabs activate on mouse-down or Enter. The embedded driver's
  // click endpoint only focuses/clicks, so use the real keyboard activation path.
  await browser.keys(Key.Enter)
  await expectView(community.id, community.nodeIds)
}

const searchNode = async (file: string, community: GraphCommunity) => {
  assert.equal(
    await browser.execute(() => document.visibilityState),
    'visible',
    'Native search acceptance requires the test window to remain visible',
  )
  await browser.$(`${canvas} [role="toolbar"] button:has(svg.lucide-search)`).click()
  const input = await browser.$('[role="combobox"][cmdk-input]')
  await input.waitForDisplayed()
  await input.setValue(file)
  const option = await browser.$(`[cmdk-item][role="option"][data-value$=" ${file}"]`)
  await browser.waitUntil(async () => (await option.getText()).includes(file), {
    timeoutMsg: `Global graph search omitted ${file}`,
  })
  await option.click()
  await expectView(community.id, community.nodeIds)
  await browser.$(node(`file:${file}`)).waitForDisplayed({ timeout: 30_000 })
  await browser.waitUntil(
    () =>
      browser.execute((id) => {
        const card = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        const pane = document.querySelector('.workspace-map-canvas')
        if (!card || !pane) return false
        const rect = card.getBoundingClientRect()
        const bounds = pane.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        return (
          centerX >= bounds.left &&
          centerX <= bounds.right &&
          centerY >= bounds.top &&
          centerY <= bounds.bottom
        )
      }, `file:${file}`),
    { timeoutMsg: `Toolbar search did not bring ${file} into the live graph viewport` },
  )
}

const buffer = (file: string) => invokeNative('fs_open_buffer_snapshot', { path: file })

const expectSinglePlate = async () => {
  assert.equal(
    await browser.execute(() => document.querySelectorAll('[data-slate-editor="true"]').length),
    1,
    'The graph must expose only one live Plate editor',
  )
}

describe('native graph community tabs and retained editor', () => {
  it('partitions real linked files, searches across tabs and retains Plate undo and autosave', async () => {
    await switchToWorkspace(fixture.alpha)
    await browser.$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-network)').click()
    await browser.$(canvas).waitForDisplayed({ timeout: 90_000 })
    const graph = await invokeNative('fs_get_workspace_graph')
    const files = graph.nodes.filter((item) => item.kind === 'file')
    assert.equal(files.length, 111)
    assert.ok(graph.edges.length > 300, 'Fixture lost its real Markdown link topology')
    assert.ok(
      graph.nodes.every((item) => item.kind === 'file'),
      'Unexpected fixture graph nodes',
    )
    const { communities } = await invokeNative('fs_partition_workspace_graph', {
      requestId: randomUUID(),
      nodes: files.map(({ id, label }) => ({ id, label })),
      edges: graph.edges.map(({ source, target }) => ({ source, target })),
    })
    assert.ok(communities.length >= 3, 'Weakly bridged dense groups were not partitioned')
    assert.ok(communities.every((item) => item.nodeIds.length > 0 && item.nodeIds.length <= 80))
    assert.equal(new Set(communities.flatMap((item) => item.nodeIds)).size, 111)
    assert.equal(
      (await browser.$$('[role="tab"][data-graph-tab-id]')).length,
      communities.length + 1,
    )
    const first = communities[0]!
    const second = communities[1]!
    await expectView(first.id, first.nodeIds)
    assert.ok((await readCanvas()).count <= 80, 'Default view eagerly rendered the entire graph')
    await chooseTab(second)
    await browser.$(tab('all')).click()
    await browser.keys(Key.Enter)
    await expectView(
      'all',
      files.map((item) => item.id),
    )

    const firstFile = first.nodeIds[0]!.replace(/^file:/, '')
    const secondFile = second.nodeIds[0]!.replace(/^file:/, '')
    await chooseTab(first)
    // This target belongs to another tab. The production toolbar searches the
    // complete workspace and must select that tab before focusing the real card.
    await searchNode(secondFile, second)
    await searchNode(firstFile, first)
    await browser.$(`${node(`file:${firstFile}`)} [title="${firstFile}"]`).click()
    await browser.$(editor).waitForDisplayed({ timeout: 90_000 })
    await expectSinglePlate()
    const initialText = await browser.$(editor).getText()
    const initialSaved = await fs.readFile(path.join(fixture.alpha, firstFile), 'utf8')
    const marker = `community-retained-${randomUUID()}`
    await typeAtEditorEnd(` ${marker}`)
    await waitForRustMarker(marker, firstFile)
    assert.ok((await browser.$(editor).getText()).includes(marker))

    await chooseTab(second)
    assert.equal(
      await browser.execute(() => document.querySelectorAll('[data-slate-editor="true"]').length),
      0,
      'An inactive group left its editor attached to the visible document',
    )
    assert.ok((await buffer(firstFile)).content.includes(marker))
    // No manual flush: autosave must finish while the owner lives in its portal.
    await browser.waitUntil(
      async () => (await fs.readFile(path.join(fixture.alpha, firstFile), 'utf8')).includes(marker),
      { timeout: 20_000, timeoutMsg: 'Autosave stopped when the editor group became inactive' },
    )
    await chooseTab(first)
    await searchNode(firstFile, first)
    await browser.$(editor).waitForDisplayed({ timeout: 30_000 })
    await expectSinglePlate()
    assert.ok((await browser.$(editor).getText()).includes(marker), 'Latest Plate text was lost')
    await browser.$(editor).click()
    // SDK 1.5 uses uppercase Z for keyCode 90. This is a WebDriver shortcut
    // through the real Plate history; no Slate history API or content replacement.
    await browser.keys([modifier, 'Z'])
    await browser.waitUntil(async () => !(await browser.$(editor).getText()).includes(marker), {
      timeoutMsg: 'Plate undo history did not survive the community tab round trip',
    })
    await browser.waitUntil(async () => !(await buffer(firstFile)).content.includes(marker), {
      timeoutMsg: 'Undo did not update the real Rust buffer',
    })
    assert.equal(await browser.$(editor).getText(), initialText)
    assert.equal((await buffer(firstFile)).content.trimEnd(), initialSaved.trimEnd())
    await browser.keys([modifier, Key.Shift, 'Z'])
    await browser.waitUntil(async () => (await browser.$(editor).getText()).includes(marker), {
      timeoutMsg: 'Plate redo history did not survive the community tab round trip',
    })
    await waitForRustMarker(marker, firstFile)
    await browser.waitUntil(
      async () =>
        (await fs.readFile(path.join(fixture.alpha, firstFile), 'utf8')) ===
        (await buffer(firstFile)).content,
      { timeout: 20_000, timeoutMsg: 'Redo did not autosave the latest native buffer to disk' },
    )
    assert.ok((await fs.readFile(path.join(fixture.alpha, firstFile), 'utf8')).includes(marker))
    await expectSinglePlate()
  }).timeout(180_000)
})
