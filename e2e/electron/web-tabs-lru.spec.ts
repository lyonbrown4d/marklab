import { expect, test, type Page } from '@playwright/test'
import type http from 'node:http'
import type { WebTabsApi } from '@/types/webTabs'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  snapshotWebTabContents,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Electron E2E fixtures are colocated outside application aliases.
import { startLocalHttpsFixture } from './localHttpsFixture.js'

test.describe('Electron web tab view pool', () => {
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
    await revealElectronWindow(session.app, page.url())
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('evicts B after A, B, C, A, D and keeps only D attached', async () => {
    if (!fixture || !session) throw new Error('Electron fixture was not started')
    const urls = Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((id) => [id, `${fixture!.url}/${id.toLowerCase()}`]),
    )
    const bounds = { x: 180, y: 140, width: 420, height: 300 }
    const activate = async (id: string) => {
      const result = await page.evaluate(
        ({ tabId, url, bounds }) =>
          (
            window as unknown as Window & { marklabElectron: { webTabs: WebTabsApi } }
          ).marklabElectron.webTabs.activate({
            tabId,
            url,
            bounds,
          }),
        { tabId: id, url: urls[id], bounds },
      )
      expect(result).toEqual({ ok: true })
      await expect
        .poll(() => snapshotWebTabContents(session!.app, page.url()))
        .toContainEqual(expect.objectContaining({ url: urls[id], attached: true }))
    }

    await activate('A')
    await activate('B')
    await activate('C')
    await activate('A')
    await activate('D')

    await expect
      .poll(() => snapshotWebTabContents(session!.app, page.url()))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: urls.A, attached: false }),
          expect.objectContaining({ url: urls.C, attached: false }),
          expect.objectContaining({ url: urls.D, attached: true }),
        ]),
      )
    const contents = await snapshotWebTabContents(session.app, page.url())
    expect(contents).toHaveLength(3)
    expect(contents.map((item) => item.url)).not.toContain(urls.B)
    expect(contents.filter((item) => item.attached).map((item) => item.url)).toEqual([urls.D])
  })
})
