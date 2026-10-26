import { expect, type Page } from '@playwright/test'

export const selectPhrase = async (page: Page, phrase: string) => {
  // Pointer coordinates must be measured after webfonts settle the text layout.
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.getByTestId('markdown-editor').getByText(phrase, { exact: false }).click()
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
