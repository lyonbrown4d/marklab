import { expect, test, type Page } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  snapshotWebContentsViews,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Electron E2E fixtures are colocated outside application aliases.
import { startLocalHttpsFixture } from './localHttpsFixture.js'

test.describe('Electron embedded web tab UI', () => {
  let page: Page
  let rendererUrl = ''
  let rendererServer: http.Server | undefined
  let fixture: Awaited<ReturnType<typeof startLocalHttpsFixture>> | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererServer = renderer.server
    rendererUrl = renderer.url
    fixture = await startLocalHttpsFixture()
  })

  test.afterAll(async () => {
    await Promise.all([closeRendererServer(rendererServer), fixture?.close()])
  })

  test.beforeEach(async () => {
    if (!fixture) throw new Error('Local HTTPS fixture was not started')
    session = await launchElectronTestSession(rendererUrl, {
      trustedCertificateSpki: fixture.spkiFingerprint,
    })
    page = session.page
    await revealElectronWindow(session.app, page, { width: 1280, height: 900 })
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('opens a Markdown link in an app tab and returns to the editable document', async () => {
    if (!fixture || !session) throw new Error('Electron fixture was not started')
    const targetUrl = `${fixture.url}/first`
    const modes = page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })

    await modes.getByRole('radio', { name: /^(Source|Source Editor|源码)$/i }).click()
    const source = page.locator('.monaco-editor')
    await expect(source).toBeVisible({ timeout: 10_000 })
    await source.click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(`[Local article](${targetUrl})`)

    await modes.getByRole('radio', { name: /^(WYSIWYG|Rich Text Editor|所见即所得)$/i }).click()
    const preview = page.getByRole('article', { name: 'Local article' })
    await expect(preview).toBeVisible({ timeout: 10_000 })
    await preview.getByRole('button', { name: /Open in app|在应用内打开/i }).click()

    await expect(page).toHaveURL(/#\/web\/[A-Za-z0-9._:-]+$/)
    expect(page.url()).not.toContain(encodeURIComponent(targetUrl))
    const toolbar = page.getByRole('toolbar', { name: /Web navigation|网页导航/i })
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByRole('textbox', { name: /Web address|网页地址/i })).toHaveValue(
      targetUrl,
    )
    const host = page.getByTestId('web-tab-native-host')
    await expect(host).toBeVisible()
    await expect
      .poll(() => snapshotWebContentsViews(session!.app, page.url()))
      .toEqual([expect.objectContaining({ url: targetUrl, visible: true })])
    const [view] = await snapshotWebContentsViews(session.app, page.url())
    const hostBox = await host.boundingBox()
    expect(hostBox).not.toBeNull()
    expect(view.bounds.width).toBeCloseTo(hostBox!.width, 0)
    expect(view.bounds.height).toBeCloseTo(hostBox!.height, 0)

    await toolbar.getByRole('button', { name: /Close Tab|关闭标签/i }).click()
    await expect(page).toHaveURL(/#\/files\/edit\//)
    await expect(page.getByTestId('markdown-editor')).toBeVisible()
    await expect.poll(() => snapshotWebContentsViews(session!.app, page.url())).toEqual([])
    await expect
      .poll(() =>
        session!.app.evaluate(
          ({ webContents }, id) => Boolean(webContents.fromId(id)),
          view.webContentsId,
        ),
      )
      .toBe(false)
  })
})
