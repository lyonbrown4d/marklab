import { expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
/* eslint-disable no-restricted-imports -- Performance scenarios share their typed harness. */
import {
  closePerformanceSession,
  launchPerformanceSession,
  openWorkspaceWindow,
  type ElectronPerformanceSession,
  type GraphicsMode,
} from './electronPerformanceHarness.js'
import { captureProcessMemorySnapshot } from './processMemoryObservability.js'
/* eslint-enable no-restricted-imports */

export const runStartupPerformanceSample = async (
  rendererUrl: string,
  graphicsMode: GraphicsMode,
  mainEntryPath: string,
) => {
  let session: ElectronPerformanceSession | undefined
  const startedAt = performance.now()
  try {
    session = await launchPerformanceSession(rendererUrl, graphicsMode, { mainEntryPath })
    await expect(session.launcherPage.getByTestId('markdown-editor')).toHaveAttribute(
      'data-state',
      'ready',
    )
    const startupToEditorReadyMs = performance.now() - startedAt
    const startupMemory = await captureProcessMemorySnapshot(session, session.launcherPage)
    // Let the primary interactive signal settle, then remove any optional initial
    // standby so the first new window is consistently a cold acquisition.
    await session.launcherPage.waitForTimeout(1_000)
    await session.app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isVisible() && window.webContents.getURL().includes('marklab-standby=1')) {
          window.destroy()
        }
      }
    })
    // Hold pool eligibility constant in this isolated test process. Actual memory
    // measurements remain untouched; production still uses its real memory guard.
    await session.app.evaluate(() => {
      const os = process.getBuiltinModule('node:os')
      const freemem = os.freemem
      os.freemem = () => Math.max(freemem(), 512 * 1024 * 1024)
    })
    const directories = ['ColdNotes', 'PooledNotes'].map((name) =>
      path.join(session!.runtimeRoot, name),
    )
    for (const directory of directories) {
      await fs.mkdir(directory)
      await fs.writeFile(
        path.join(directory, `${path.basename(directory)}.md`),
        '# Performance fixture\n',
      )
    }
    const cold = await openWorkspaceWindow(session, directories[0], 'ColdNotes.md')
    expect(cold.result).toMatchObject({ ok: true, startup: { source: 'cold' } })
    const countStandby = () =>
      session!.app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter(
            (window) =>
              !window.isDestroyed() &&
              !window.isVisible() &&
              window.webContents.getURL().includes('marklab-standby=1'),
          ).length,
      )
    await expect.poll(countStandby, { timeout: 5_000 }).toBe(1)
    const hadStandby = (await countStandby()) === 1
    const pooled = await openWorkspaceWindow(session, directories[1], 'PooledNotes.md')
    expect(pooled.result).toMatchObject({ ok: true, startup: { source: 'pool' } })
    await expect.poll(countStandby, { timeout: 5_000 }).toBe(1)
    const mainLoop = await session.app.evaluateHandle(() => {
      const { monitorEventLoopDelay } = process.getBuiltinModule('node:perf_hooks')
      const monitor = monitorEventLoopDelay({ resolution: 10 })
      monitor.enable()
      return monitor
    })
    // A fixed observation interval records idle responsiveness rather than interaction latency.
    await pooled.page.waitForTimeout(2_000)
    const idleMainLoop = await mainLoop.evaluate((monitor) => {
      monitor.disable()
      return {
        meanMs: monitor.mean / 1e6,
        p95Ms: monitor.percentile(95) / 1e6,
        maxMs: monitor.max / 1e6,
      }
    })
    await mainLoop.dispose()
    const withStandby = await captureProcessMemorySnapshot(session, pooled.page)
    const removedStandby = await session.app.evaluate(({ BrowserWindow }) => {
      const standby = BrowserWindow.getAllWindows().filter(
        (window) =>
          !window.isDestroyed() &&
          !window.isVisible() &&
          window.webContents.getURL().includes('marklab-standby=1'),
      )
      for (const window of standby) window.destroy()
      return standby.length
    })
    await pooled.page.waitForTimeout(1_000)
    const withoutStandby = await captureProcessMemorySnapshot(session, pooled.page)
    const requests = await session.launcherPage.evaluate(
      () =>
        performance.getEntriesByType('resource').filter((entry) => entry.name.endsWith('.js'))
          .length,
    )
    return {
      startupToEditorReadyMs,
      coldWindowReadyMs: cold.initialization.openRequestToReadyMs,
      pooledWindowReadyMs: pooled.initialization.openRequestToReadyMs,
      coldResult: cold.result,
      pooledResult: pooled.result,
      hadStandby,
      poolEligibilityControlled: true,
      removedStandby,
      idleMainLoop,
      javascriptRequests: requests,
      memory: { startup: startupMemory, withStandby, withoutStandby },
      gpuFeatureStatus: session.gpuFeatureStatus,
    }
  } finally {
    await closePerformanceSession(session)
  }
}
