import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Performance E2E reuses the production renderer server.
import { closeRendererServer, startRendererServer } from '../electron/electronTestHarness.js'
/* eslint-disable no-restricted-imports -- Node-run Playwright helpers use sibling ESM modules. */
import {
  closePerformanceSession,
  launchPerformanceSession,
  openWorkspaceWindow,
  resizeElectronWindow,
  type ElectronPerformanceSession,
} from './electronPerformanceHarness.js'
import { writeLargeDocumentWorkspace } from './largeDocumentFixture.js'
/* eslint-enable no-restricted-imports */

type GpuInfo = {
  auxAttributes?: Record<string, unknown>
  gpuDevice?: Array<Record<string, unknown>>
}

type GpuDiagnostics = {
  activeDevices: Array<Record<string, unknown>>
  featureStatus: Record<string, string>
  gpuInfo: GpuInfo
}

const SOFTWARE_GPU_PATTERN =
  /swiftshader|llvmpipe|lavapipe|software rasterizer|microsoft basic render|disabled_software|unavailable_software/i
const RENDERING_WARNING_PATTERN =
  /tile memory.*(?:limit|budget).*exceed|ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)/i

const attachJson = async (testInfo: TestInfo, name: string, value: unknown) =>
  testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  })

const readGpuDiagnostics = async (session: ElectronPerformanceSession): Promise<GpuDiagnostics> => {
  const gpuInfo = (await session.app.evaluate(async ({ app }) =>
    app.getGPUInfo('complete'),
  )) as GpuInfo
  const featureStatus = session.gpuFeatureStatus as Record<string, string>
  const devices = Array.isArray(gpuInfo.gpuDevice) ? gpuInfo.gpuDevice : []
  const explicitlyActive = devices.filter((device) => device.active === true)
  return {
    activeDevices: explicitlyActive.length > 0 ? explicitlyActive : devices,
    featureStatus,
    gpuInfo,
  }
}

const assertHardwareGpu = (diagnostics: GpuDiagnostics) => {
  const message = `Native GPU diagnostics:\n${JSON.stringify(diagnostics, null, 2)}`
  expect(diagnostics.activeDevices, message).not.toHaveLength(0)
  expect(diagnostics.featureStatus.gpu_compositing, message).toMatch(/^enabled/)
  expect(diagnostics.featureStatus.rasterization, message).toMatch(/^enabled/)
  expect(JSON.stringify(diagnostics.activeDevices), message).not.toMatch(SOFTWARE_GPU_PATTERN)
  expect(JSON.stringify(diagnostics.gpuInfo.auxAttributes ?? {}), message).not.toMatch(
    SOFTWARE_GPU_PATTERN,
  )
}

const installRendererIssueCapture = async (page: Page) => {
  const messages: string[] = []
  page.on('console', (message) => messages.push(`[console:${message.type()}] ${message.text()}`))
  page.on('pageerror', (error) => messages.push(`[pageerror] ${error.stack ?? error.message}`))
  await page.evaluate(() => {
    const observedWindow = window as typeof window & { __marklabRenderingIssues?: string[] }
    observedWindow.__marklabRenderingIssues = []
    window.addEventListener(
      'error',
      (event) => {
        if (event.message) observedWindow.__marklabRenderingIssues?.push(event.message)
      },
      true,
    )
  })
  return messages
}

const waitForStableGeometry = async (locator: Locator) => {
  await locator.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        let previous = ''
        let stableFrames = 0
        let sampledFrames = 0
        const sample = () => {
          const rect = element.getBoundingClientRect()
          const current = [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(':')
          stableFrames = current === previous ? stableFrames + 1 : 0
          previous = current
          sampledFrames += 1
          if (stableFrames >= 8) {
            resolve()
            return
          }
          if (sampledFrames >= 180) {
            reject(new Error(`Workspace Map node geometry did not settle: ${current}`))
            return
          }
          requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      }),
  )
}

const readEmbeddedGeometry = (viewport: Locator) =>
  viewport.evaluate((element) => {
    const surfaceElement = element.closest<HTMLElement>(
      '[data-testid="workspace-map-editor-surface"]',
    )
    const editorRoot = element.firstElementChild as HTMLElement | null
    const plateShell = editorRoot?.firstElementChild as HTMLElement | null
    const scrollSurface = element.querySelector<HTMLElement>('[data-testid="markdown-editor"]')
    return {
      contain: getComputedStyle(element).contain,
      editorRootHeight: editorRoot?.clientHeight ?? 0,
      plateShellHeight: plateShell?.clientHeight ?? 0,
      scrollClientHeight: scrollSurface?.clientHeight ?? 0,
      scrollHeight: scrollSurface?.scrollHeight ?? 0,
      surfaceHeight: surfaceElement?.offsetHeight ?? 0,
      surfaceWidth: surfaceElement?.offsetWidth ?? 0,
      viewportHeight: (element as HTMLElement).clientHeight,
      viewportWidth: (element as HTMLElement).clientWidth,
    }
  })

const exerciseInternalScroll = async (viewport: Locator) => {
  await viewport.evaluate((element) => {
    const scrollSurface = element.querySelector<HTMLElement>('[data-testid="markdown-editor"]')
    if (!scrollSurface) throw new Error('Embedded Markdown scroll surface was not found')
    scrollSurface.scrollTop = scrollSurface.scrollHeight
    scrollSurface.dispatchEvent(new Event('scroll'))
  })
  await expect
    .poll(() =>
      viewport.evaluate(
        (element) =>
          element.querySelector<HTMLElement>('[data-testid="markdown-editor"]')?.scrollTop ?? 0,
      ),
    )
    .toBeGreaterThan(0)
}

test('native GPU keeps an activated long Markdown map node bounded and warning-free', async ({
  playwright,
}, testInfo) => {
  void playwright
  test.skip(testInfo.project.name !== 'native-gpu', 'This regression gate requires native GPU')
  let rendererServer: http.Server | undefined
  let session: ElectronPerformanceSession | undefined
  let rendererMessages: string[] = []
  try {
    const renderer = await startRendererServer()
    rendererServer = renderer.server
    session = await launchPerformanceSession(renderer.url, 'native-gpu')
    const gpuDiagnostics = await readGpuDiagnostics(session)
    await attachJson(testInfo, 'native-gpu-diagnostics.json', gpuDiagnostics)
    assertHardwareGpu(gpuDiagnostics)

    const fixture = writeLargeDocumentWorkspace(session.runtimeRoot)
    const { page } = await openWorkspaceWindow(session, fixture.workspacePath, fixture.fileName)
    await resizeElectronWindow(session, page, { width: 1280, height: 900 })
    rendererMessages = await installRendererIssueCapture(page)

    await page.getByRole('radio', { name: /^(Map|地图)$/i }).click()
    const surface = page.getByTestId('workspace-map-editor-surface')
    await expect(surface).toBeVisible()
    await surface.click()
    await expect(surface).toHaveAttribute('data-editor-active', 'true')
    const viewport = surface.getByTestId('workspace-map-editor-viewport')
    await expect(viewport).toBeVisible()
    await expect(viewport.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready', {
      timeout: 120_000,
    })
    await waitForStableGeometry(surface)

    const geometry = await readEmbeddedGeometry(viewport)
    expect(geometry.contain).toBe('strict')
    expect(geometry.surfaceWidth).toBeGreaterThan(0)
    expect(geometry.surfaceWidth).toBeLessThanOrEqual(800)
    expect(geometry.surfaceHeight).toBeGreaterThan(0)
    expect(geometry.surfaceHeight).toBeLessThanOrEqual(800)
    expect(geometry.viewportWidth).toBeLessThanOrEqual(geometry.surfaceWidth)
    expect(geometry.viewportHeight).toBeLessThanOrEqual(geometry.surfaceHeight)
    expect(geometry.editorRootHeight).toBe(geometry.viewportHeight)
    expect(geometry.plateShellHeight).toBe(geometry.viewportHeight)
    expect(geometry.scrollClientHeight).toBe(geometry.viewportHeight)
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.scrollClientHeight)
    await exerciseInternalScroll(viewport)
    await waitForStableGeometry(surface)

    const windowIssues = await page.evaluate(
      () =>
        (window as typeof window & { __marklabRenderingIssues?: string[] })
          .__marklabRenderingIssues ?? [],
    )
    const allOutput = [...session.output, ...rendererMessages, ...windowIssues]
    const renderingWarnings = allOutput.filter((message) => RENDERING_WARNING_PATTERN.test(message))
    await attachJson(testInfo, 'workspace-map-rendering-diagnostics.json', {
      geometry,
      renderingWarnings,
    })
    expect(renderingWarnings, `Rendering warnings:\n${renderingWarnings.join('\n')}`).toEqual([])
  } finally {
    const capturedOutput = [...(session?.output ?? []), ...rendererMessages]
    if (capturedOutput.length > 0) {
      await testInfo.attach('electron-output.log', {
        body: Buffer.from(capturedOutput.join('\n'), 'utf8'),
        contentType: 'text/plain',
      })
    }
    await closePerformanceSession(session)
    await closeRendererServer(rendererServer)
  }
})
