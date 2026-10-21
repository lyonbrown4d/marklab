import type { Page } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Browser-only renderer regression fixture.
import { test, expect } from './rendererTest.js'

const selectPhrase = async (page: Page, phrase: string) => {
  const points = await page.getByTestId('markdown-editor').evaluate((editor, target) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const start = node.textContent?.indexOf(target) ?? -1
      if (start >= 0) {
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, start + target.length)
        const rectangles = [...range.getClientRects()]
        const first = rectangles[0]
        const last = rectangles.at(-1)
        if (!first || !last) throw new Error('Selection has no visible geometry')
        return {
          start: { x: first.left + 1, y: first.top + first.height / 2 },
          end: { x: last.right - 1, y: last.top + last.height / 2 },
        }
      }
      node = walker.nextNode()
    }
    throw new Error(`Cannot find selection phrase: ${target}`)
  }, phrase)
  await page.mouse.move(points.start.x, points.start.y)
  await page.mouse.down()
  await page.mouse.move(points.end.x, points.end.y, { steps: 6 })
  await page.mouse.up()
  expect(await page.evaluate(() => getSelection()?.toString())).toContain(phrase)
}

const expectAnchored = async (page: Page) => {
  const toolbar = page.getByRole('toolbar', { name: /^(Text|文本)$/i })
  await expect(toolbar).toBeVisible()
  await expect
    .poll(() =>
      toolbar.evaluate((element) => {
        const floating = element.closest('[data-slot="popover-content"]')
        const selection = getSelection()
        if (!floating || !selection?.rangeCount) return false
        const selected = selection.getRangeAt(0).getBoundingClientRect()
        const box = floating.getBoundingClientRect()
        const overlap = Math.min(box.right, selected.right) - Math.max(box.left, selected.left)
        const gap = Math.min(
          Math.abs(box.bottom - selected.top),
          Math.abs(box.top - selected.bottom),
        )
        return (
          selected.width > 0 &&
          box.width > 0 &&
          overlap > 0 &&
          gap <= 24 &&
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= innerWidth + 1 &&
          box.bottom <= innerHeight + 1
        )
      }),
    )
    .toBe(true)
}

test('renders math and footnotes through the production Plate editor', async ({
  session: { page },
}) => {
  await expect(page.getByRole('math', { name: 'x^2' })).toBeVisible()
  await expect(page.getByRole('math', { name: 'y = 2' })).toBeVisible()
  const definition = page.locator('[role="doc-footnote"][aria-label="[^note]"]')
  await expect(definition).toContainText('Footnote body.')
  const id = await definition.getAttribute('id')
  expect(id).toBeTruthy()
  await expect(page.getByRole('link', { name: '[^note]' })).toHaveAttribute('href', `#${id}`)
})

test('keeps the selection toolbar anchored across scroll, browser zoom, IME and document changes', async ({
  session: { page, context },
}) => {
  const editor = page.getByTestId('markdown-editor')
  await selectPhrase(page, 'Selectable phrase')
  await expectAnchored(page)
  expect(
    await page
      .getByRole('toolbar', { name: /^(Text|文本)$/i })
      .evaluate((element) =>
        document.querySelector('[data-testid="markdown-editor"]')?.contains(element),
      ),
  ).toBe(false)
  const before = await editor.evaluate((element) => element.scrollTop)
  await editor.evaluate((element) => {
    element.scrollTop += 56
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(before)
  await expectAnchored(page)
  const cdp = await context.newCDPSession(page)
  try {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.35 })
    await expect.poll(() => page.evaluate(() => visualViewport?.scale)).toBeCloseTo(1.35, 2)
    await expectAnchored(page)
  } finally {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
    await cdp.detach()
  }
  await editor.dispatchEvent('compositionstart')
  await expect(page.getByRole('toolbar', { name: /^(Text|文本)$/i })).toBeHidden()
  await editor.dispatchEvent('compositionend')
  await page.keyboard.press('ControlOrMeta+Shift+L')
  await page
    .getByRole('region', { name: /^(Files|文件)$/i })
    .getByRole('button', { name: 'Second.md', exact: true })
    .click()
  await expect(page.getByRole('toolbar', { name: /^(Text|文本)$/i })).toHaveCount(0)
  await expect(editor).toContainText('Second document')
})

test.describe('table and animated caret', () => {
  test.use({
    documents: {
      'Tables.md': [
        '# 表格与光标',
        '| 角色 | 建议先读 |',
        '| --- | --- |',
        '| 新成员 / TL | `01-general`、`02-technology-baseline`、`05-rd-process`、`glossary` |',
        '| 前端工程师 | `03-frontend-engineering`、`06-security-and-access` |',
        '',
        '| A | B | C | D | E | F | G | H |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        '| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |',
      ].join('\n'),
    },
    initialFile: 'Tables.md',
  })

  test('fits default tables to the document and keeps wide tables scrollable and resizable', async ({
    session: { page },
  }) => {
    const editor = page.getByTestId('markdown-editor')
    const table = editor.locator('table').first()
    await expect(table).toBeVisible()
    for (const width of [1440, 760]) {
      await page.setViewportSize({ width, height: 960 })
      await expect
        .poll(() =>
          table.evaluate((element) => {
            const wrapper = element.parentElement!
            const style = getComputedStyle(wrapper)
            const available =
              wrapper.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            return Math.abs(element.getBoundingClientRect().width - available)
          }),
        )
        .toBeLessThan(2)
    }
    const cells = table.locator('tbody tr').nth(1).locator('td')
    expect((await cells.last().boundingBox())!.height).toBeLessThan(150)
    expect(
      await cells
        .last()
        .locator('p')
        .evaluate((paragraph) => paragraph.scrollWidth - paragraph.clientWidth),
    ).toBeLessThanOrEqual(1)
    const wideTable = editor.locator('table').last()
    expect(
      await wideTable.evaluate((element) => {
        const wrapper = element.parentElement!
        return wrapper.scrollWidth > wrapper.clientWidth
      }),
    ).toBe(true)
    const header = table.locator('th').first()
    await header.hover()
    const before = (await header.boundingBox())!
    const resizeHandle = header.getByRole('separator')
    const handle = (await resizeHandle.boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + 32, handle.y + handle.height / 2, {
      steps: 4,
    })
    await page.mouse.up()
    await expect
      .poll(async () => (await header.boundingBox())!.width - before.width)
      .toBeCloseTo(32, 0)
    await expect(table).toContainText('02-technology-baseline')
    await resizeHandle.focus()
    for (let step = 0; step < 5; step++) await page.keyboard.press('Shift+ArrowRight')
    expect((await table.locator('th').last().boundingBox())!.width).toBeGreaterThanOrEqual(95)
    for (let step = 0; step < 5; step++) await page.keyboard.press('Shift+ArrowLeft')
    const capture = test.info().outputPath('table-layout.png')
    await page.screenshot({ path: capture })
    await test.info().attach('table-layout', { path: capture, contentType: 'image/png' })
  })

  test('keeps the caret aligned during fast typing, line breaks and scrolling inside a table', async ({
    session: { page },
  }) => {
    const editor = page.getByTestId('markdown-editor')
    const cell = editor.locator('table').first().locator('th').first()
    await cell.locator('p').click()
    await page.keyboard.press('End')
    const caret = page.locator('body > [data-marklab-plate-overlay="animated-cursor"]')
    await expect(caret).toBeVisible()
    const expectAligned = async () => {
      const difference = await caret.evaluate(async (element) => {
        await new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        )
        const range = getSelection()!.getRangeAt(0).getBoundingClientRect()
        const overlay = element.getBoundingClientRect()
        return {
          x: Math.abs(overlay.left + overlay.width / 2 - range.left),
          y: Math.abs(overlay.top - range.top),
        }
      })
      expect(difference.x).toBeLessThan(2)
      expect(difference.y).toBeLessThan(2)
    }
    await page.keyboard.type('abcdef', { delay: 1 })
    await expectAligned()
    await page.keyboard.press('Enter')
    await page.keyboard.type('输入后保持对齐', { delay: 1 })
    await expectAligned()
    await editor.evaluate((element) => {
      element.scrollTop += 24
    })
    await expectAligned()
    await editor.dispatchEvent('compositionstart')
    await expect(caret).toBeHidden()
    await editor.dispatchEvent('compositionend')
    await expect(caret).toBeVisible()
  })
})
