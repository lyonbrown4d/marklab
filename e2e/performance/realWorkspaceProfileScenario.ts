import { expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
/* eslint-disable no-restricted-imports -- Performance scenarios share the Electron harness. */
import {
  closePerformanceSession,
  launchPerformanceSession,
  openWorkspaceWindow,
  resizeElectronWindow,
  type ElectronPerformanceSession,
} from './electronPerformanceHarness.js'
import { measureFrames } from './frameMeasurement.js'
import { measureInputLatency } from './plateInputLatencyMetrics.js'
import {
  captureEditorLocatorState,
  dragNativeScrollbar,
  EDITABLE_PLATE_EDITOR_SELECTOR,
  exerciseWheel,
  PLATE_EDITOR_SELECTOR,
} from './platePerformanceMetrics.js'
import { profileRendererInteraction } from './rendererCpuProfile.js'
/* eslint-enable no-restricted-imports */

const HOME_FILE = 'Home.md'
const LARGE_FILE = 'libs-panhe.md'
const SEARCH_QUERY = 'client'

const waitForStableGeometry = (page: Page, selector: string) =>
  page
    .locator(selector)
    .filter({ visible: true })
    .evaluate(
      (element) =>
        new Promise<void>((resolve, reject) => {
          let previous = ''
          let stableFrames = 0
          let sampledFrames = 0
          const sample = () => {
            const rect = element.getBoundingClientRect()
            const current = [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(':')
            stableFrames =
              current === previous && rect.width > 0 && rect.height > 0 ? stableFrames + 1 : 0
            previous = current
            sampledFrames += 1
            if (stableFrames >= 8) resolve()
            else if (sampledFrames >= 180)
              reject(new Error(`Editor geometry did not settle: ${current}`))
            else requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        }),
    )

const copyWorkspace = (sourceRoot: string, runtimeRoot: string) => {
  const targetRoot = path.join(runtimeRoot, 'real-workspace-copy')
  fs.cpSync(sourceRoot, targetRoot, {
    filter: (source) => path.basename(source) !== '.git',
    recursive: true,
  })
  if (!fs.statSync(path.join(targetRoot, HOME_FILE)).isFile()) {
    throw new Error(`Real workspace fixture is missing ${HOME_FILE}`)
  }
  if (!fs.statSync(path.join(targetRoot, LARGE_FILE)).isFile()) {
    throw new Error(`Real workspace fixture is missing ${LARGE_FILE}`)
  }
  return targetRoot
}

const openQuickFile = async (page: Page, fileName: string) => {
  await page.keyboard.press('ControlOrMeta+P')
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await dialog.locator('[cmdk-input]').fill(fileName)
  const option = dialog.locator('[cmdk-item]').filter({ hasText: fileName }).first()
  await expect(option).toBeVisible({ timeout: 20_000 })
  await option.click()
  await expect(dialog).toBeHidden()
  await expect(page.locator(PLATE_EDITOR_SELECTOR)).toHaveAttribute('data-state', 'ready', {
    timeout: 60_000,
  })
  await waitForStableGeometry(page, PLATE_EDITOR_SELECTOR)
}

const exerciseSearch = async (page: Page) => {
  await page.keyboard.press('ControlOrMeta+P')
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  const input = dialog.locator('[cmdk-input]')
  await input.press('ControlOrMeta+2')
  await input.fill(SEARCH_QUERY)
  const results = dialog.locator('[cmdk-item]')
  await expect.poll(() => results.count(), { timeout: 30_000 }).toBeGreaterThan(0)
  const resultCount = await results.count()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  return { query: SEARCH_QUERY, resultCount }
}

const exerciseMap = async (page: Page) => {
  await page.locator('[role="radio"][aria-label="Map"], [role="radio"][aria-label="地图"]').click()
  const canvas = page.locator('.workspace-map-canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  const nodes = canvas.locator('.react-flow__node')
  await expect.poll(() => nodes.count(), { timeout: 60_000 }).toBeGreaterThan(10)
  await expect.poll(() => canvas.locator('.react-flow__edge').count()).toBeGreaterThan(0)
  return {
    edgeCount: await canvas.locator('.react-flow__edge').count(),
    nodeCount: await nodes.count(),
  }
}

const stripRawProfile = <Result>(
  measured: Awaited<ReturnType<typeof profileRendererInteraction<Result>>>,
) => {
  const { rawCpuProfile, ...profile } = measured.profile
  return { profile, rawCpuProfile, result: measured.result }
}

export const runRealWorkspaceProfile = async ({
  rendererUrl,
  runIndex,
  sourceRoot,
  testInfo,
  warmup,
}: {
  rendererUrl: string
  runIndex: number
  sourceRoot: string
  testInfo: TestInfo
  warmup: boolean
}) => {
  let session: ElectronPerformanceSession | undefined
  const electronOutput: string[] = []
  const rendererErrors: string[] = []
  try {
    session = await launchPerformanceSession(rendererUrl, 'native-gpu')
    const workspaceRoot = copyWorkspace(sourceRoot, session.runtimeRoot)
    const opened = await openWorkspaceWindow(session, workspaceRoot, HOME_FILE)
    const page = opened.page
    page.on('console', (message) => {
      if (message.type() === 'error') rendererErrors.push(message.text())
    })
    page.on('pageerror', (error) => rendererErrors.push(error.stack ?? error.message))
    await resizeElectronWindow(session, page, { height: 960, width: 1440 })

    const switchMeasured = stripRawProfile(
      await profileRendererInteraction(page, 'switch-largest-document', async () => {
        const startedAt = performance.now()
        const frames = await measureFrames(page, () => openQuickFile(page, LARGE_FILE))
        return { frames, readyMs: Number((performance.now() - startedAt).toFixed(2)) }
      }),
    )
    const editor = page.locator(PLATE_EDITOR_SELECTOR).filter({ visible: true })
    const editable = page.locator(EDITABLE_PLATE_EDITOR_SELECTOR).filter({ visible: true })
    await expect(editor).toHaveCount(1)
    await expect(editor).toBeVisible()
    await expect(editable).toHaveCount(1)
    await expect(editable).toBeVisible()
    const initialEditor = await captureEditorLocatorState(editor)

    const scrollMeasured = stripRawProfile(
      await profileRendererInteraction(page, 'wheel-scroll-largest-document', () =>
        measureFrames(page, () => exerciseWheel(page, editor)),
      ),
    )
    const afterWheelEditor = await captureEditorLocatorState(editor)
    const scrollbarMeasured = stripRawProfile(
      await profileRendererInteraction(page, 'native-scrollbar-drag', async () => {
        let scrollbar: Awaited<ReturnType<typeof dragNativeScrollbar>> | undefined
        const frames = await measureFrames(page, async () => {
          scrollbar = await dragNativeScrollbar(page, editor)
        })
        if (!scrollbar) throw new Error('Native scrollbar probe did not return metrics')
        return { frames, scrollbar }
      }),
    )
    const afterScrollbarEditor = await captureEditorLocatorState(editor)
    await page.keyboard.press('ControlOrMeta+End')
    await editable.locator('[data-slate-node="text"]').last().click()
    const marker = `marklab-profile-${runIndex}`
    const inputMeasured = stripRawProfile(
      await profileRendererInteraction(page, 'continuous-input', async () => {
        let latency: Awaited<ReturnType<typeof measureInputLatency>> | undefined
        const frames = await measureFrames(page, async () => {
          latency = await measureInputLatency(page, editable, marker)
        })
        if (!latency) throw new Error('Input latency probe did not return metrics')
        return { frames, latency }
      }),
    )
    await page.keyboard.press('ControlOrMeta+Z')
    const finalEditor = await captureEditorLocatorState(editor)

    const searchMeasured = stripRawProfile(
      await profileRendererInteraction(page, 'full-text-search', async () => {
        let search: Awaited<ReturnType<typeof exerciseSearch>> | undefined
        const frames = await measureFrames(page, async () => {
          search = await exerciseSearch(page)
        })
        if (!search) throw new Error('Full-text search did not return metrics')
        return { frames, search }
      }),
    )
    const mapMeasured = stripRawProfile(
      await profileRendererInteraction(page, 'workspace-map-open', async () => {
        let map: Awaited<ReturnType<typeof exerciseMap>> | undefined
        const frames = await measureFrames(page, async () => {
          map = await exerciseMap(page)
        })
        if (!map) throw new Error('Workspace Map did not return metrics')
        return { frames, map }
      }),
    )

    if (!warmup) {
      await testInfo.attach(`real-workspace-run-${runIndex}.png`, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      })
    }
    const rawProfiles = {
      input: inputMeasured.rawCpuProfile,
      map: mapMeasured.rawCpuProfile,
      search: searchMeasured.rawCpuProfile,
      scroll: scrollMeasured.rawCpuProfile,
      scrollbar: scrollbarMeasured.rawCpuProfile,
      switch: switchMeasured.rawCpuProfile,
    }
    return {
      editor: {
        afterScrollbar: afterScrollbarEditor,
        afterWheel: afterWheelEditor,
        final: finalEditor,
        initial: initialEditor,
      },
      electronOutput,
      gpuFeatureStatus: session.gpuFeatureStatus,
      initialization: opened.initialization,
      input: { profile: inputMeasured.profile, ...inputMeasured.result },
      map: { profile: mapMeasured.profile, ...mapMeasured.result },
      rawProfiles,
      rendererErrors,
      runIndex,
      search: { profile: searchMeasured.profile, ...searchMeasured.result },
      scroll: { profile: scrollMeasured.profile, frames: scrollMeasured.result },
      scrollbar: { profile: scrollbarMeasured.profile, ...scrollbarMeasured.result },
      switchDocument: { profile: switchMeasured.profile, ...switchMeasured.result },
      warmup,
    }
  } finally {
    if (session) {
      await closePerformanceSession(session)
      electronOutput.push(...session.output)
    }
    if (electronOutput.length) {
      await testInfo.attach(`real-workspace-electron-run-${runIndex}.log`, {
        body: electronOutput.join('\n'),
        contentType: 'text/plain',
      })
    }
  }
}

export type RealWorkspaceProfileSample = Awaited<ReturnType<typeof runRealWorkspaceProfile>>
