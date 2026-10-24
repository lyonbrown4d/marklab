/// <reference types="mocha" />
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Native acceptance helpers only. */
import { fixturePaths } from './fixturePaths.js'
import { invokeNative, openEditor, switchToWorkspace } from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

const fixture = fixturePaths()
const visibleSourceEditor = async () => {
  let editor: WebdriverIO.Element | undefined
  await browser.waitUntil(
    async () => {
      for (const candidate of await browser.$$('.monaco-editor')) {
        if (await candidate.isDisplayed()) {
          editor = candidate
          return true
        }
      }
      return false
    },
    { timeout: 45_000, timeoutMsg: 'The active source editor never became visible' },
  )
  if (!editor) throw new Error('Missing active source editor')
  return editor
}
const selectFile = async (name: string) => {
  // A file click closes the drawer; its old button can remain visible during
  // the exit animation. Read the persistent open state before toggling.
  if (
    (await browser.$('[data-app-focus-zone="editor"]').getAttribute('data-sidebar-pinned')) !==
    'true'
  )
    await browser
      .$('[data-app-focus-zone="titlebar"] button:has(svg.lucide-panel-left)')
      .click({ button: 'left' })
  const button = await browser.$(`button[data-file-tree-node]=${name}`)
  await button.waitForDisplayed()
  await button.click()
}
const toggle =
  'button[aria-pressed][aria-label^="预览"], button[aria-pressed][aria-label^="Preview"]'

describe('native document previews', () => {
  it('previews Excel sheets and CSV/TSV in standalone tabs without modifying source buffers', async () => {
    await switchToWorkspace(fixture.alpha)
    await openEditor()
    await browser.waitUntil(
      async () =>
        (await browser.$('[data-app-focus-zone="editor"]').getAttribute('data-sidebar-pinned')) ===
        'false',
      { timeoutMsg: 'The initial editor focus handoff did not close the file drawer' },
    )
    const workbookPath = path.join(fixture.alpha, 'Workbook.xlsx')
    const originalWorkbook = await fs.readFile(workbookPath)
    await selectFile('Workbook.xlsx')
    await browser.$('[role="grid"]').waitForDisplayed({ timeout: 45_000 })
    assert.match(await browser.$('[role="grid"]').getText(), /native-excel-preview/)
    const rendered = await browser.execute(() => {
      const grid = document.querySelector('[role="grid"]')
      if (!grid) throw new Error('Missing native spreadsheet grid')
      return {
        rows: grid.querySelectorAll('[role="row"]').length,
        columns: grid.querySelectorAll('[role="columnheader"]').length,
        height: grid.getBoundingClientRect().height,
        background: getComputedStyle(grid).backgroundColor,
      }
    })
    assert.ok(rendered.rows < 100, 'Grid mounted the whole page instead of virtualizing rows')
    assert.ok(rendered.columns < 40, 'Grid mounted the full worksheet width')
    assert.ok(rendered.height > 200)
    assert.notEqual(rendered.background, 'rgba(0, 0, 0, 0)')
    const formulaCell = '[role="row"][aria-rowindex="2"] [role="gridcell"][aria-colindex="4"]'
    assert.match(await browser.$(formulaCell).getText(), /^99(?:\.00)?$/)
    await browser
      .$('//button[normalize-space(.)="计算公式" or normalize-space(.)="Calculate formulas"]')
      .click()
    await browser.waitUntil(
      async () => /^50(?:\.00)?$/.test(await browser.$(formulaCell).getText()),
      { timeout: 45_000 },
    )
    // The driver's plain click only calls HTMLElement.click(). Pointer actions
    // also emit mousedown, which React Data Grid uses to select a cell.
    await browser.$(formulaCell).click({ button: 'left' })
    await browser.waitUntil(
      async () =>
        /=SUM\(B1,8\)/.test(
          await browser
            .$('output[aria-label="公式或原始值"], output[aria-label="Formula or raw value"]')
            .getText(),
        ),
      { timeoutMsg: 'Pointer cell selection did not display the original formula' },
    )
    await browser.$('[role="combobox"]').click()
    await browser.keys('ArrowDown')
    await browser.$('[role="option"]=第二页').click()
    await browser.waitUntil(async () =>
      (await browser.$('[role="grid"]').getText()).includes('second-sheet-content'),
    )
    assert.match(
      await browser
        .$('[role="row"][aria-rowindex="2"] [role="gridcell"][aria-colindex="3"]')
        .getText(),
      /^100(?:\.00)?$/,
    )
    assert.deepEqual(
      await fs.readFile(workbookPath),
      originalWorkbook,
      'Preview calculation modified the workbook',
    )
    for (const [name, marker] of [
      ['Table.csv', 'native-csv-preview'],
      ['Table.tsv', 'native-tsv-preview'],
    ]) {
      await selectFile(name)
      const editor = await visibleSourceEditor()
      const before = await invokeNative('fs_open_buffer_snapshot', {
        path: name,
      })
      await browser.$(toggle).click()
      const grid = await browser.$(`[role="grid"][aria-label^="${name}"]`)
      await grid.waitForDisplayed()
      assert.match(await grid.getText(), new RegExp(marker))
      assert.equal(await editor.isDisplayed(), false)
      await browser.$(toggle).click()
      await editor.waitForDisplayed()
      const after = await invokeNative('fs_open_buffer_snapshot', {
        path: name,
      })
      assert.equal(after.content, before.content)
    }
  })

  it('renders Mermaid and isolated static HTML, including embedded document previews', async () => {
    await selectFile('Flow.mmd')
    await visibleSourceEditor()
    await browser.$(toggle).click()
    await browser.$('[data-plate-mermaid-output] svg').waitForDisplayed({ timeout: 45_000 })
    assert.match(await browser.$('[data-plate-mermaid-output]').getText(), /native-mermaid-file/)
    await selectFile('Page.html')
    await visibleSourceEditor()
    await browser.$(toggle).click()
    const frame = await browser.$('iframe[sandbox]')
    await frame.waitForDisplayed()
    assert.equal(await frame.getAttribute('sandbox'), '')
    const doc = await frame.getAttribute('srcdoc')
    assert.ok(doc)
    assert.match(doc, /native-html-preview/)
    assert.match(doc, /default-src 'none'/)
    assert.doesNotMatch(doc, /<script|__html_preview_escape/)
    assert.equal(await browser.execute(() => '__html_preview_escape' in window), false)
    await openEditor('Previews.md')
    const embedded = await browser.$('[data-testid="markdown-editor"]')
    const csv = await embedded.$('[role="grid"][aria-label^="Table.csv"]')
    await csv.waitForDisplayed()
    assert.match(await csv.getText(), /native-csv-preview/)
    assert.match(await embedded.getText(), /Workbook.xlsx/)
    // Reveal offscreen cards through real scrolling so viewport-based loading runs.
    const mermaidCard = await browser.$(
      '//article[@data-marklab-editor-chrome="embedded-preview"][.//span[text()="Flow.mmd"]]',
    )
    await mermaidCard.scrollIntoView()
    const mermaid = await mermaidCard.$('[data-plate-mermaid-output] svg')
    await mermaid.waitForDisplayed({ timeout: 45_000 })
    const htmlCard = await browser.$(
      '//article[@data-marklab-editor-chrome="embedded-preview"][.//span[text()="Page.html"]]',
    )
    await htmlCard.scrollIntoView()
    const html = await browser.$('[data-testid="markdown-editor"] iframe[sandbox]')
    await html.waitForDisplayed()
    assert.match((await html.getAttribute('srcdoc')) ?? '', /native-html-preview/)
  })
})
