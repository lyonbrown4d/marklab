import { expect, test } from '@playwright/test'

test('shows real screenshots and a correctly matched macOS download', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Marklab')
  await expect(page.getByRole('link', { name: '下载 macOS 版', exact: true })).toHaveAttribute(
    'href',
    /\/releases\/download\/app-v\d+\.\d+\.\d+\/Marklab-\d+\.\d+\.\d+-mac-arm64\.dmg$/,
  )
  const hero = page.getByAltText('Marklab 编辑器截图')
  await expect(hero).toBeVisible()
  await expect
    .poll(() =>
      hero.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true)
  const graph = page.getByAltText('Marklab 图视图截图')
  await graph.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      graph.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true)
  await page.getByRole('region', { name: '图视图', exact: true }).screenshot({
    path: info.outputPath('graph.png'),
    animations: 'disabled',
  })
  await page.screenshot({
    path: info.outputPath('home.png'),
    fullPage: true,
    animations: 'disabled',
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('switches languages and preserves the repository base path', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'English', exact: true }).click()
  await expect(page).toHaveURL(/\/marklab\/en\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Marklab')
  await page.getByRole('link', { name: 'Guide', exact: true }).click()
  await expect(page).toHaveURL(/\/marklab\/en\/guide\/getting-started\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Getting started')
})

test('serves internal links, guides, and download details without broken routes', async ({
  page,
  request,
}) => {
  await page.goto('./')
  const urls = await page.getByRole('link').evaluateAll((links) => [
    ...new Set(
      links
        .map((link) => {
          const url = new URL((link as HTMLAnchorElement).href)
          url.hash = ''
          return url.origin === location.origin ? url.href : null
        })
        .filter((url): url is string => Boolean(url)),
    ),
  ])
  const responses = await Promise.all(urls.map((url) => request.get(url)))
  for (const response of responses) expect(response.status(), response.url()).toBe(200)
  await page.locator('header').getByRole('link', { name: /^下载/ }).click()
  await expect(page.getByRole('heading', { name: '下载', exact: true })).toBeVisible()
  await expect(
    page.getByRole('rowheader', { name: 'macOS · Apple Silicon', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('rowheader', { name: /Intel/ })).toHaveCount(0)
  await expect(
    page.getByText('macOS 仅支持 Apple Silicon（M 系列），不支持 Intel Mac。', { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('opens Starlight search and finds Vim documentation', async ({ page }) => {
  await page.goto('guide/getting-started/')
  await page
    .getByRole('button', { name: /搜索|Search/ })
    .first()
    .click()
  const input = page.locator('dialog input').first()
  await expect(input).toBeVisible()
  await input.fill('Vim')
  const result = page.locator('dialog').getByRole('link', { name: /Vim/ }).first()
  await expect(result).toBeVisible()
  await result.click()
  await expect(page).toHaveURL(/\/marklab\/guide\/vim\/(?:#.*)?$/)
})
