// eslint-disable-next-line no-restricted-imports -- Browser-only renderer regression fixture.
import { test, expect } from './rendererTest.js'

test.use({
  documents: {
    'notes/start.md':
      '# Start\n\n[Current heading](#%E6%9C%AC%E9%A1%B5%E6%A0%87%E9%A2%98)\n\n[Other heading](../docs/guide.md#details)\n\n## 本页标题\n\nCurrent section.\n',
    'docs/guide.md': '# Guide\n\n## Details\n\nTarget section.\n',
  },
  initialFile: 'notes/start.md',
})

test('follows same-document and lazy cross-document headings without replacing the app route', async ({
  session: { page },
}) => {
  const initialRoute = new URL(page.url()).hash
  const current = page.getByRole('link', { name: 'Current heading', exact: true })
  await current.click()
  expect(new URL(page.url()).hash).toBe(initialRoute)
  await current.click({ modifiers: ['ControlOrMeta'] })
  expect(new URL(page.url()).hash).toBe(initialRoute)
  const selectedHeading = () =>
    page.evaluate(
      () => document.getSelection()?.anchorNode?.parentElement?.closest('h2')?.textContent ?? null,
    )
  await expect.poll(selectedHeading).toBe('本页标题')

  await page
    .getByRole('link', { name: 'Other heading', exact: true })
    .click({ modifiers: ['ControlOrMeta'] })
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).hash))
    .toContain('/files/edit/docs/guide.md')
  await expect(page.getByRole('heading', { name: 'Details', exact: true })).toBeVisible()
  await expect.poll(selectedHeading).toBe('Details')
})
