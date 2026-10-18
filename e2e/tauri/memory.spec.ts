/// <reference types="mocha" />
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { browser } from '@wdio/globals'
import { Key } from 'webdriverio'
import type { FsGraph, WorkspaceGraphNodeDetailsResult } from '@/services/fsApiSchemas'
/* eslint-disable no-restricted-imports -- Native E2E helpers never enter production bundles. */
import { fixturePaths } from './fixturePaths.js'
import {
  invokeNative,
  openEditor,
  switchToWorkspace,
  typeAtEditorEnd,
  waitForRustMarker,
} from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

const fixture = fixturePaths()
// A separate document keeps previous journeys' input out of this undo batch.
const file = 'Memory.md'
const editorSelector = '[data-testid="markdown-editor"][data-state="ready"]'
const modifier = process.platform === 'darwin' ? Key.Command : Key.Control

const readBuffer = () =>
  invokeNative<{ content: string }>('fs_open_buffer_snapshot', { path: file })

const switchView = async (icon: 'files' | 'network') => {
  await browser.$(`[data-app-focus-zone="titlebar"] button:has(svg.lucide-${icon})`).click()
}

describe('native background resource lifecycle', () => {
  it('keeps editing and undo across graph navigation with real Rust previews', async () => {
    await switchToWorkspace(fixture.alpha)
    await openEditor(file)
    await invokeNative<number>('fs_flush_buffers')
    const savedBefore = await fs.readFile(path.join(fixture.alpha, file), 'utf8')
    assert.match(savedBefore, /alpha-only memory workspace/)
    const textBefore = await browser.$(editorSelector).getText()
    const marker = `memory-lifecycle-${randomUUID()}`
    await typeAtEditorEnd(` ${marker}`)
    await waitForRustMarker(marker, file)

    await switchView('network')
    await browser.$('.react-flow').waitForDisplayed({ timeout: 90_000 })
    const graph = await invokeNative<FsGraph>('fs_get_workspace_graph')
    assert.ok(graph.revision, 'Real Rust topology did not expose its revision')
    assert.ok(graph.nodes.some((node) => node.id === `file:${file}`))
    const details = await invokeNative<WorkspaceGraphNodeDetailsResult>(
      'fs_get_workspace_graph_node_details',
      { revision: graph.revision, node_ids: [`file:${file}`], mode: 'summary', max_nodes: 1 },
    )
    assert.equal(details.revision, graph.revision)
    assert.equal(details.items.length, 1)
    const item = details.items[0]!
    assert.equal(item.id, `file:${file}`)
    assert.ok(item.preview, 'Real Rust graph details omitted the native preview')
    assert.ok(item.preview.html.length > 0)
    assert.ok(Buffer.byteLength(item.preview.html, 'utf8') <= 32_768)
    assert.ok(item.preview.math.length <= 64)
    assert.doesNotMatch(item.preview.html, /<script\b|<iframe\b|<img\b|\bon\w+\s*=/i)

    await switchView('files')
    await openEditor(file)
    assert.ok((await browser.$(editorSelector).getText()).includes(marker))
    assert.ok((await readBuffer()).content.includes(marker))
    // WebDriver owns the shortcut. Do not invoke Slate history or replace editor contents.
    await browser.$(editorSelector).click()
    // SDK 1.5 maps printable character codes directly: uppercase Z produces keyCode 90.
    await browser.keys([modifier, 'Z'])
    await browser.waitUntil(
      async () => !(await browser.$(editorSelector).getText()).includes(marker),
      { timeoutMsg: 'Native undo did not remove the edit after returning from the graph' },
    )
    await browser.waitUntil(async () => !(await readBuffer()).content.includes(marker), {
      timeoutMsg: 'Native undo did not reach the actual Rust buffer',
    })
    assert.equal(await browser.$(editorSelector).getText(), textBefore)
    assert.equal((await readBuffer()).content.trimEnd(), savedBefore.trimEnd())

    await browser.keys([modifier, Key.Shift, 'Z'])
    await browser.waitUntil(
      async () => (await browser.$(editorSelector).getText()).includes(marker),
      { timeoutMsg: 'Native redo did not restore the edit after returning from the graph' },
    )
    await waitForRustMarker(marker, file)
    assert.match((await readBuffer()).content, /alpha-only memory workspace/)
    await invokeNative<number>('fs_flush_buffers')
    assert.equal(
      await fs.readFile(path.join(fixture.alpha, file), 'utf8'),
      (await readBuffer()).content,
    )
    assert.match(
      await fs.readFile(path.join(fixture.alpha, 'Editor.md'), 'utf8'),
      /native-persisted-marker/,
    )
  })
})
