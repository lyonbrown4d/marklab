import type { Locator } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Browser-only renderer regression fixture.
import { test, expect } from './rendererTest.js'

test.use({
  documents: {
    'Introduction.md': '# Introduction\n\nIntroduction content from the real fixture document.\n',
    'Details.md': '# Details\n\nDetails content from the second fixture document.\n',
  },
  initialFile: 'Introduction.md',
})

const expectUnclipped = async (control: Locator) => {
  await expect(control).toBeVisible()
  await expect(control).toBeInViewport({ ratio: 1 })
  expect(
    await control.evaluate((element) => {
      const box = element.getBoundingClientRect()
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor)
        const clip = ancestor.getBoundingClientRect()
        if (
          /(auto|scroll|hidden|clip)/.test(style.overflowX) &&
          (box.left < clip.left - 1 || box.right > clip.right + 1)
        )
          return false
        if (
          /(auto|scroll|hidden|clip)/.test(style.overflowY) &&
          (box.top < clip.top - 1 || box.bottom > clip.bottom + 1)
        )
          return false
      }
      return [
        [box.left + 5, box.top + 5],
        [box.right - 5, box.bottom - 5],
      ].every(([x, y]) => element.contains(document.elementFromPoint(x, y)))
    }),
    'export control is clipped or covered by another surface',
  ).toBe(true)
}

test('keeps workspace publication selection, preview and export reachable at desktop widths', async ({
  session: { page },
}, info) => {
  await page.keyboard.press('ControlOrMeta+P')
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true })
  await palette.getByRole('combobox').fill('> Export Workspace')
  await palette.getByRole('option', { name: /Export Workspace/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Export Workspace', exact: true })
  await expect(dialog.getByRole('checkbox', { name: 'Introduction', exact: true })).toBeChecked()

  for (const width of [640, 800, 1440]) {
    await page.setViewportSize({ width, height: 700 })
    const compact = width < 1024
    const chaptersTab = dialog.getByRole('tab', { name: 'Chapters', exact: true })
    const previewTab = dialog.getByRole('tab', { name: 'Document preview', exact: true })
    const settingsTab = dialog.getByRole('tab', { name: 'Print settings', exact: true })
    if (compact) await chaptersTab.click()
    const introduction = dialog.getByRole('checkbox', { name: 'Introduction', exact: true })
    const details = dialog.getByRole('checkbox', { name: 'Details', exact: true })
    if (await details.isChecked()) await details.uncheck()
    await expect(introduction).toBeChecked()
    // Selecting the first chapter navigates the real preview past the cover and contents pages.
    await dialog.getByText('Introduction', { exact: true }).first().click()
    if (compact) await previewTab.click()
    const preview = dialog.getByRole('region', { name: 'Document preview', exact: true })
    await expect(preview).toBeVisible()
    await expect(
      preview.getByText('Introduction content from the real fixture document.', { exact: true }),
    ).toBeVisible()
    await expect(preview.locator('article')).toHaveCount(1)
    if (compact) await settingsTab.click()
    const exportButton = dialog.getByRole('button', { name: 'Export PDF', exact: true })
    await expect(exportButton).toBeEnabled()
    await expectUnclipped(exportButton)
    if (compact) {
      await chaptersTab.click()
      await expect(details).not.toBeChecked()
      await introduction.uncheck()
      await settingsTab.click()
      await expect(exportButton).toBeDisabled()
      await chaptersTab.click()
      await introduction.check()
      await expect(details).not.toBeChecked()
      await settingsTab.click()
      await expect(settingsTab).toHaveAttribute('aria-selected', 'true')
      await expect(exportButton).toBeEnabled()
    } else {
      await expect(chaptersTab).toBeHidden()
      const chapterBox = await introduction.locator('xpath=ancestor::aside').boundingBox()
      const previewBox = await preview.boundingBox()
      const settingsBox = await exportButton.locator('xpath=ancestor::aside').boundingBox()
      if (!chapterBox || !previewBox || !settingsBox)
        throw new Error('Publication panes are missing')
      expect(chapterBox.x + chapterBox.width).toBeLessThanOrEqual(previewBox.x + 1)
      expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(settingsBox.x + 1)
    }
    const screenshot = info.outputPath(`publication-${width}.png`)
    await page.screenshot({ path: screenshot, animations: 'disabled' })
    await info.attach(`publication-${width}`, { path: screenshot, contentType: 'image/png' })
  }
})
