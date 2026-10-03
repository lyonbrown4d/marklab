import { expect, test, type Page } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

test.describe('Plate Markdown input rules', () => {
  let page: Page
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })

  test.afterAll(async () => closeRendererServer(server))

  test.beforeEach(async () => {
    session = await launchElectronTestSession(rendererUrl)
    page = session.page
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('recognizes block, inline, and fenced-code Markdown from real keyboard input', async () => {
    const editor = page.getByTestId('markdown-editor')
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('# ')
    await expect(editor.locator('h1')).toBeVisible()
    await page.keyboard.type('Heading')
    await expect(editor.locator('h1')).toHaveText('Heading')

    await page.keyboard.type(' **bold**')
    await expect(editor.locator('strong')).toHaveText('bold')

    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('```mermaid')
    await page.keyboard.press('Enter')
    await expect(editor.locator('pre code[data-language="mermaid"]')).toBeVisible()
  })
})
