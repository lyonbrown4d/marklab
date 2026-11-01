/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { browser } from '@wdio/globals'
import { Key } from 'webdriverio'
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
const request = {
  center_path: null,
  depth: 1,
  direction: 'both',
  include_attachments: false,
  include_missing: true,
  max_nodes: 10_000,
  max_edges: 30_000,
} as const
const graphSurface = '[data-testid="knowledge-graph"]'
const editor = '[data-testid="markdown-editor"][data-state="ready"]'

describe('native document relation graph', () => {
  it('opens a selected document, saves edits, and restores graph navigation', async () => {
    await switchToWorkspace(fixture.alpha)
    const graph = await invokeNative('fs_get_workspace_graph', request)
    const document = graph.nodes.find((node) => node.kind === 'file')
    assert.ok(document, 'Fixture contains no Markdown documents')
    assert.equal(graph.mode, 'relations')
    assert.ok(graph.edges.every((edge) => edge.count > 0))

    await browser.$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-network)').click()
    await browser.$(graphSurface).waitForDisplayed({ timeout: 90_000 })
    const search = await browser.$(`${graphSurface} input`)
    await search.setValue(document.path)
    const result = await browser.$(`${graphSurface} ul button`)
    await result.waitForDisplayed()
    assert.ok((await result.getText()).includes(document.path))
    await result.click()
    assert.equal(
      await browser.$(editor).isExisting(),
      false,
      'Selecting a graph node opened an embedded editor',
    )
    await result.doubleClick()
    await browser.$(editor).waitForDisplayed({ timeout: 90_000 })
    const marker = `relation-edit-${randomUUID()}`
    await typeAtEditorEnd(` ${marker}`)
    await waitForRustMarker(marker, document.path)
    await browser.waitUntil(
      async () =>
        (await fs.readFile(path.join(fixture.alpha, document.path), 'utf8')).includes(marker),
      { timeout: 20_000, timeoutMsg: 'Document edit was not saved' },
    )
    await browser.keys([Key.Alt, Key.ArrowLeft])
    await browser.$(graphSurface).waitForDisplayed({ timeout: 30_000 })
    const selected = await browser.$(`${graphSurface} ul button[aria-current="true"]`)
    // The camera/selection can be restored without the search list staying open.
    const selectionRestored = await selected.isExisting()
    const previewRestored = await browser.$('aside button').isExisting()
    assert.ok(selectionRestored || previewRestored, 'Graph return lost its selected document')
  }).timeout(180_000)
})
