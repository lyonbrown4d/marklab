import { expect, type Page } from '@playwright/test'
import { performance } from 'node:perf_hooks'
import type { WebTabBounds, WebTabEvent, WebTabsApi, WebTabState } from '@/types/webTabs'
// eslint-disable-next-line no-restricted-imports -- Performance E2E helpers are Node-run sibling modules.
import type { ElectronPerformanceSession } from './electronPerformanceHarness.js'

type TestWindow = Window & {
  marklabElectron: { webTabs: WebTabsApi }
  webTabEvents?: WebTabEvent[]
}

export type WebTabResourceSnapshot = {
  attachedCount: number
  processes: Array<{
    memory: Electron.MemoryInfo | null
    pid: number
  }>
  webContents: Array<{
    attached: boolean
    id: number
    pid: number
    url: string
  }>
  webContentsCount: number
}

export type WebTabPerformanceSample = {
  boundsStableMs: number
  coldActivateMs: number
  gpuFeatureStatus: object
  runIndex: number
  snapshots: {
    one: WebTabResourceSnapshot
    three: WebTabResourceSnapshot
    closed: WebTabResourceSnapshot
  }
  warmSwitchMs: number[]
}

const initialBounds: WebTabBounds = { x: 120, y: 130, width: 360, height: 240 }
const resizedBounds: WebTabBounds = { x: 140, y: 150, width: 440, height: 300 }
const pollOptions = { intervals: [10, 25, 50, 100], timeout: 15_000 }

const snapshotAttachedViews = (session: ElectronPerformanceSession) =>
  session.app.evaluate(({ BrowserWindow, WebContentsView }, origin) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => {
      const url = candidate.webContents.getURL()
      return url.startsWith(`${origin}/`) && new URL(url).pathname === '/'
    })
    if (!window) throw new Error('Main renderer window was not found')
    return window.contentView.children
      .filter((child): child is Electron.WebContentsView => child instanceof WebContentsView)
      .map((view) => ({
        bounds: view.getBounds(),
        url: view.webContents.getURL(),
        visible: view.getVisible(),
      }))
  }, new URL(session.launcherPage.url()).origin)

const installStateRecorder = (page: Page) =>
  page.evaluate(() => {
    const testWindow = window as unknown as TestWindow
    testWindow.webTabEvents = []
    testWindow.marklabElectron.webTabs.onState((event) => testWindow.webTabEvents?.push(event))
  })

const latestState = (page: Page, tabId: string): Promise<WebTabState | undefined> =>
  page.evaluate(
    (id) =>
      (window as unknown as TestWindow).webTabEvents
        ?.flatMap((event) =>
          event.type === 'state' && event.state.tabId === id ? [event.state] : [],
        )
        .at(-1),
    tabId,
  )

const waitForReadyAttached = async (
  session: ElectronPerformanceSession,
  tabId: string,
  url: string,
) => {
  const page = session.launcherPage
  await expect
    .poll(async () => {
      const [state, views] = await Promise.all([
        latestState(page, tabId),
        snapshotAttachedViews(session),
      ])
      return {
        attached: views.length === 1 && views[0]?.visible && views[0].url === url,
        ready: state?.status === 'ready' && state.active && state.url === url,
      }
    }, pollOptions)
    .toEqual({ attached: true, ready: true })
}

const activate = async (session: ElectronPerformanceSession, tabId: string, url: string) => {
  const started = performance.now()
  const result = await session.launcherPage.evaluate(
    ({ bounds, tabId, url }) =>
      (window as unknown as TestWindow).marklabElectron.webTabs.activate({ bounds, tabId, url }),
    { bounds: initialBounds, tabId, url },
  )
  expect(result).toEqual({ ok: true })
  await waitForReadyAttached(session, tabId, url)
  return Number((performance.now() - started).toFixed(2))
}

const snapshotResources = async (
  session: ElectronPerformanceSession,
  trackedPids: number[] = [],
): Promise<WebTabResourceSnapshot> =>
  session.app.evaluate(
    ({ app, BrowserWindow, session: electronSession, WebContentsView, webContents }, args) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => {
        const url = candidate.webContents.getURL()
        return url.startsWith(`${args.origin}/`) && new URL(url).pathname === '/'
      })
      if (!window) throw new Error('Main renderer window was not found')
      const attached = new Set(
        window.contentView.children
          .filter((child): child is Electron.WebContentsView => child instanceof WebContentsView)
          .map((view) => view.webContents.id),
      )
      const tabSession = electronSession.fromPartition(`marklab-web-tabs-${window.id}`)
      const contents = webContents
        .getAllWebContents()
        .filter((item) => item.session === tabSession)
        .map((item) => ({
          attached: attached.has(item.id),
          id: item.id,
          pid: item.getOSProcessId(),
          url: item.getURL(),
        }))
        .sort((left, right) => left.url.localeCompare(right.url))
      const pids = new Set([...args.trackedPids, ...contents.map((item) => item.pid)])
      const processes = app
        .getAppMetrics()
        .filter((metric) => pids.has(metric.pid))
        .map((metric) => ({ pid: metric.pid, memory: metric.memory ?? null }))
      return {
        attachedCount: contents.filter((item) => item.attached).length,
        processes,
        webContents: contents,
        webContentsCount: contents.length,
      }
    },
    { trackedPids, origin: new URL(session.launcherPage.url()).origin },
  )

const resizeActiveView = async (session: ElectronPerformanceSession, url: string) => {
  const page = session.launcherPage
  const started = performance.now()
  await session.app.evaluate(({ BrowserWindow }, origin) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => {
      const url = candidate.webContents.getURL()
      return url.startsWith(`${origin}/`) && new URL(url).pathname === '/'
    })
    if (!window) throw new Error('Main renderer window was not found')
    window.setContentSize(1024, 768)
  }, new URL(page.url()).origin)
  const result = await page.evaluate(
    (bounds) =>
      (window as unknown as TestWindow).marklabElectron.webTabs.setBounds({
        bounds,
        tabId: 'perf-B',
      }),
    resizedBounds,
  )
  expect(result).toEqual({ ok: true })
  await expect
    .poll(() => snapshotAttachedViews(session), pollOptions)
    .toEqual([expect.objectContaining({ bounds: resizedBounds, url, visible: true })])
  return Number((performance.now() - started).toFixed(2))
}

const closeAll = async (session: ElectronPerformanceSession) => {
  for (const tabId of ['perf-A', 'perf-B', 'perf-C']) {
    const result = await session.launcherPage.evaluate(
      (id) => (window as unknown as TestWindow).marklabElectron.webTabs.close({ tabId: id }),
      tabId,
    )
    expect(result).toEqual({ ok: true })
  }
  await expect
    .poll(() => snapshotResources(session), pollOptions)
    .toMatchObject({ attachedCount: 0, webContentsCount: 0 })
}

export const runWebTabPerformanceSample = async (
  session: ElectronPerformanceSession,
  baseUrl: string,
  runIndex: number,
): Promise<WebTabPerformanceSample> => {
  await installStateRecorder(session.launcherPage)
  const urls = {
    A: `${baseUrl}/a`,
    B: `${baseUrl}/b`,
    C: `${baseUrl}/c`,
  }
  const coldActivateMs = await activate(session, 'perf-A', urls.A)
  const one = await snapshotResources(session)
  await activate(session, 'perf-B', urls.B)
  await activate(session, 'perf-C', urls.C)
  const three = await snapshotResources(session)
  const warmSwitchMs: number[] = []
  for (const id of ['A', 'B', 'C', 'A', 'B'] as const) {
    warmSwitchMs.push(await activate(session, `perf-${id}`, urls[id]))
  }
  const boundsStableMs = await resizeActiveView(session, urls.B)
  await closeAll(session)
  const trackedPids = [...one.webContents, ...three.webContents].map((item) => item.pid)
  const closed = await snapshotResources(session, trackedPids)
  return {
    boundsStableMs,
    coldActivateMs,
    gpuFeatureStatus: session.gpuFeatureStatus,
    runIndex,
    snapshots: { one, three, closed },
    warmSwitchMs,
  }
}
