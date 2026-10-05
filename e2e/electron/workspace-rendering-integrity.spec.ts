import { expect, test, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

const workspaceRoot = process.env.MARKLAB_E2E_WORKSPACE?.trim()
const mermaidDocument = 'architecture-overview.md'
const drawioDocument = 'third-party-client-route-overview.drawio'
const openTreeFile = async (page: Page, fileName: string) => {
  await page.keyboard.press('ControlOrMeta+P')
  const dialog = page.getByRole('dialog', { name: /^(Command palette|命令面板)$/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox').fill(fileName)
  const file = dialog.getByRole('option').filter({ hasText: fileName }).first()
  await expect(file).toBeVisible({ timeout: 15_000 })
  await file.click()
  await expect(dialog).toBeHidden()
}

type MermaidRenderSnapshot = {
  busy: boolean
  containerHeight: number
  containerWidth: number
  error: string | null
  height: number
  nearViewport: boolean
  source: string
  svg: boolean
  width: number
}

const visibleMermaidSnapshots = async (page: Page): Promise<MermaidRenderSnapshot[]> => {
  return page.locator('[data-plate-preview="mermaid"]').evaluateAll((previews) =>
    previews.map((preview) => {
      const block = preview.parentElement
      const svg = preview.querySelector('svg')
      const box = svg?.getBoundingClientRect()
      const containerBox = preview.getBoundingClientRect()
      return {
        busy: preview.getAttribute('aria-busy') === 'true',
        containerHeight: containerBox.height,
        containerWidth: containerBox.width,
        error: preview.querySelector('[role="alert"]')?.textContent?.trim() || null,
        height: box?.height ?? 0,
        nearViewport: containerBox.bottom >= -360 && containerBox.top <= window.innerHeight + 360,
        source: block?.querySelector('code[data-language]')?.textContent?.trim() ?? '',
        svg: Boolean(svg),
        width: box?.width ?? 0,
      }
    }),
  )
}

const expectNearTrigger = async (trigger: Locator, tooltip: Locator) => {
  const [triggerBox, tooltipBox] = await Promise.all([trigger.boundingBox(), tooltip.boundingBox()])
  expect(triggerBox).not.toBeNull()
  expect(tooltipBox).not.toBeNull()
  if (!triggerBox || !tooltipBox) return
  const triggerCenter = triggerBox.x + triggerBox.width / 2
  const tooltipCenter = tooltipBox.x + tooltipBox.width / 2
  expect(Math.abs(triggerCenter - tooltipCenter)).toBeLessThan(tooltipBox.width + 24)
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(triggerBox.y + 8)
}

test.describe('Real workspace rendering integrity', () => {
  test.skip(!workspaceRoot, 'Set MARKLAB_E2E_WORKSPACE to run the real-workspace audit.')
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument before testInfo.
  test.afterEach(async ({}, testInfo) => {
    if (session) {
      await testInfo.attach('electron-output.txt', {
        body: session.output.join('\n') || '(no Electron process output)',
        contentType: 'text/plain',
      })
    }
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument before testInfo.
  test('renders every Mermaid block in the wiki document', async ({}, testInfo) => {
    test.setTimeout(120_000)
    session = await launchElectronTestSession(rendererUrl, { openTargets: [workspaceRoot!] })
    const page = session.page
    await revealElectronWindow(session.app, page, { width: 1280, height: 900 })
    await openTreeFile(page, mermaidDocument)
    const markdown = fs.readFileSync(path.join(workspaceRoot!, mermaidDocument), 'utf8')
    const expectedCount = Array.from(markdown.matchAll(/^```(?:mermaid|mmd)\s*$/gim)).length
    expect(expectedCount).toBeGreaterThan(0)
    const editor = page.getByTestId('markdown-editor')
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 45_000 })
    await expect(
      editor
        .locator('code[data-language="mermaid"]')
        .filter({ hasText: 'App[业务应用或框架集成]' }),
    ).toBeAttached({ timeout: 45_000 })
    const sources = new Set<string>()
    const previews = page.locator('[data-plate-preview="mermaid"]')
    await expect(previews).toHaveCount(expectedCount)

    for (let index = 0; index < expectedCount; index += 1) {
      await previews
        .nth(index)
        .evaluate((preview) => preview.scrollIntoView({ behavior: 'instant', block: 'center' }))
      let observed: MermaidRenderSnapshot[] = []
      try {
        await expect
          .poll(
            async () => {
              observed = await visibleMermaidSnapshots(page)
              const snapshot = observed[index]
              return Boolean(
                snapshot &&
                !snapshot.error &&
                snapshot.svg &&
                snapshot.height > 24 &&
                snapshot.width > 40,
              )
            },
            { timeout: 10_000 },
          )
          .toBe(true)
      } catch (error) {
        throw new Error(
          `Mermaid ${index + 1}/${expectedCount} did not render: ${JSON.stringify(observed)}`,
          { cause: error },
        )
      }
      for (const snapshot of await visibleMermaidSnapshots(page)) {
        expect(snapshot.error).toBeNull()
        if (snapshot.svg && snapshot.height > 24 && snapshot.width > 40 && snapshot.source) {
          sources.add(snapshot.source)
        }
      }
    }
    if (sources.size !== expectedCount) {
      throw new Error(
        `Rendered ${sources.size}/${expectedCount} Mermaid blocks; snapshots=${JSON.stringify(await visibleMermaidSnapshots(page))}`,
      )
    }
    await expect(previews.first().locator('svg')).toContainText('业务应用或框架集成')

    const screenshot = await page.screenshot({ animations: 'disabled', fullPage: false })
    await testInfo.attach('mermaid-rendering.png', { body: screenshot, contentType: 'image/png' })
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument before testInfo.
  test('loads the Draw.io editor and keeps status-bar tooltips anchored', async ({}, testInfo) => {
    test.setTimeout(120_000)
    session = await launchElectronTestSession(rendererUrl, { openTargets: [workspaceRoot!] })
    const page = session.page
    await revealElectronWindow(session.app, page, { width: 1280, height: 900 })
    await openTreeFile(page, drawioDocument)

    await expect(page.getByText(drawioDocument, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })
    const frame = page.getByTitle(/third-party-client-route-overview\.drawio.*Draw\.io/i)
    await expect(frame).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /^(Save|保存)$/i })).toBeEnabled({
      timeout: 60_000,
    })
    const framePage = page.frameLocator('iframe[title*="Draw.io"]')
    await expect(framePage.locator('body')).toBeVisible({ timeout: 30_000 })
    const diagramCanvas = framePage.locator('.geDiagramContainer').first()
    await expect(diagramCanvas).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => diagramCanvas.locator('svg path, svg text, canvas').count())
      .toBeGreaterThan(0)
    await diagramCanvas.click({ position: { x: 24, y: 24 } })
    await page.keyboard.press('Escape')

    const statusBar = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
    const terminal = statusBar.getByRole('button', { name: /Toggle terminal|切换终端/i })
    await terminal.hover()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toBeVisible()
    await expectNearTrigger(terminal, tooltip)

    const screenshot = await page.screenshot({ animations: 'disabled', fullPage: false })
    await testInfo.attach('drawio-and-tooltip.png', { body: screenshot, contentType: 'image/png' })
    const auditDirectory = path.resolve('output/playwright/product-audit')
    fs.mkdirSync(auditDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(auditDirectory, 'rendering-integrity-electron.log'),
      session.output.join('\n'),
    )
  })
})
