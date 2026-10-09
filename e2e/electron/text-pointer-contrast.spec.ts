import { expect, test } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

const expectHighContrastTextPointer = async (
  locator: ReturnType<ElectronTestSession['page']['locator']>,
) => {
  await expect(locator).toBeVisible({ timeout: 15_000 })
  const readCursor = () => locator.evaluate((element) => getComputedStyle(element).cursor)
  await expect.poll(readCursor).toContain('data:image/svg+xml')
  await expect.poll(readCursor).toContain('12 12')
}

test.describe('Text pointer contrast', () => {
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.afterAll(async () => closeRendererServer(server))

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('uses the visible I-beam in light Plate, Monaco, and embedded editors', async () => {
    session = await launchElectronTestSession(rendererUrl)
    const { app, page } = session
    await app.evaluate(({ nativeTheme }) => {
      nativeTheme.themeSource = 'light'
    })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(false)

    await expectHighContrastTextPointer(page.getByTestId('markdown-editor'))

    const modes = page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })
    await modes.getByRole('radio', { name: /^(Source|Source Editor|源码)$/i }).click()
    await expectHighContrastTextPointer(
      page.locator('.source-code-editor .view-lines.monaco-mouse-cursor-text'),
    )

    await page.getByRole('radio', { name: /^(Map|地图)$/i }).click()
    const node = page.getByTestId('workspace-map-editor-surface').first()
    await expect(node).toBeVisible({ timeout: 15_000 })
    await node.click()
    await expectHighContrastTextPointer(page.getByTestId('markdown-editor'))
  })
})
