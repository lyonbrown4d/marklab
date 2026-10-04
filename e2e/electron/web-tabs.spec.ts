import { expect, test, type Page } from '@playwright/test'
import type http from 'node:http'
import type { WebTabEvent, WebTabsApi } from '@/types/webTabs'
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

type WebTabTestWindow = Window & {
  marklabElectron: { webTabs: WebTabsApi }
  webTabEvents?: WebTabEvent[]
}

test.describe('Electron embedded web tabs', () => {
  let page: Page
  let rendererServer: http.Server | undefined
  let rendererUrl = ''
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
    await revealElectronWindow(session.app, page.url())
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('activates, navigates and closes a native view through typed preload IPC', async () => {
    if (!fixture || !session) throw new Error('Electron fixture was not started')
    const tabId = 'e2e-web-tab'
    const firstUrl = `${fixture.url}/first`
    const secondUrl = `${fixture.url}/second`
    const bounds = { x: 180, y: 140, width: 420, height: 300 }

    await page.evaluate(() => {
      const testWindow = window as unknown as WebTabTestWindow
      testWindow.webTabEvents = []
      testWindow.marklabElectron.webTabs.onState((event) => testWindow.webTabEvents?.push(event))
    })
    const activation = await page.evaluate(
      ({ tabId, url, bounds }) =>
        (window as unknown as WebTabTestWindow).marklabElectron.webTabs.activate({
          tabId,
          url,
          bounds,
        }),
      { tabId, url: firstUrl, bounds },
    )
    expect(activation).toEqual({ ok: true })

    await expect
      .poll(() => readState(page, tabId), { timeout: 10_000 })
      .toMatchObject({ status: 'ready', active: true, url: firstUrl })
    const events = await page.evaluate(
      () => (window as unknown as WebTabTestWindow).webTabEvents ?? [],
    )
    expect(events.some((event) => event.type === 'state' && event.state.status === 'loading')).toBe(
      true,
    )

    await expect
      .poll(() => snapshotWebContentsViews(session!.app, page.url()))
      .toEqual([
        expect.objectContaining({
          bounds,
          title: 'First local page',
          url: firstUrl,
          visible: true,
        }),
      ])
    const [view] = await snapshotWebContentsViews(session.app, page.url())

    await page.evaluate(
      ({ tabId, url }) =>
        (window as unknown as WebTabTestWindow).marklabElectron.webTabs.navigate({ tabId, url }),
      { tabId, url: secondUrl },
    )
    await expect
      .poll(() => readState(page, tabId))
      .toMatchObject({ status: 'ready', canGoBack: true, url: secondUrl })

    await page.evaluate(
      (tabId) => (window as unknown as WebTabTestWindow).marklabElectron.webTabs.goBack({ tabId }),
      tabId,
    )
    await expect.poll(() => readState(page, tabId)).toMatchObject({ url: firstUrl })
    await page.evaluate(
      (tabId) =>
        (window as unknown as WebTabTestWindow).marklabElectron.webTabs.goForward({ tabId }),
      tabId,
    )
    await expect.poll(() => readState(page, tabId)).toMatchObject({ url: secondUrl })

    await page.evaluate(
      (tabId) => (window as unknown as WebTabTestWindow).marklabElectron.webTabs.close({ tabId }),
      tabId,
    )
    await expect.poll(() => readState(page, tabId)).toMatchObject({ status: 'closed' })
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

const readState = async (page: Page, tabId: string) =>
  page.evaluate((id) => {
    const events = (window as unknown as WebTabTestWindow).webTabEvents ?? []
    return events
      .flatMap((event) => (event.type === 'state' && event.state.tabId === id ? [event.state] : []))
      .at(-1)
  }, tabId)
