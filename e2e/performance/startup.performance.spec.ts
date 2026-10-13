import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
/* eslint-disable no-restricted-imports -- Performance tests share the isolated desktop harness. */
import { closeRendererServer, startRendererServer } from '../electron/electronTestHarness.js'
import { runStartupPerformanceSample } from './startupPerformanceScenario.js'
import {
  collectPerformanceSamples,
  PERFORMANCE_SAMPLE_PLAN,
  summarizeDurations,
} from './performanceStatistics.js'
import type { GraphicsMode } from './electronPerformanceHarness.js'
/* eslint-enable no-restricted-imports */

// eslint-disable-next-line no-empty-pattern -- Native Electron runs independently of browser fixtures.
test('profiles isolated startup, new-window latency, idle responsiveness and standby memory', async ({}, testInfo) => {
  const buildRoot = path.resolve(process.env.MARKLAB_PERFORMANCE_BUILD_ROOT || '.')
  const graphicsMode = testInfo.project.name as GraphicsMode
  const plan =
    process.env.MARKLAB_PERFORMANCE_SMOKE === '1'
      ? { measuredRuns: 1, warmupRuns: 0 }
      : PERFORMANCE_SAMPLE_PLAN
  const renderer = await startRendererServer(path.join(buildRoot, 'dist'))
  try {
    const result = await collectPerformanceSamples({
      maxAttempts: 2 * (plan.measuredRuns + plan.warmupRuns),
      plan,
      runSample: async ({ attemptIndex, warmup }) => {
        console.log(`Startup sample ${attemptIndex + 1} started (warmup=${warmup})`)
        try {
          const sample = await runStartupPerformanceSample(
            renderer.url,
            graphicsMode,
            path.join(buildRoot, 'dist-electron/main.js'),
          )
          console.log(
            `Startup sample ${attemptIndex + 1} ready in ${Math.round(sample.startupToEditorReadyMs)}ms`,
          )
          return { warmup, ...sample }
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error))
          throw error
        }
      },
    })
    const samples = result.samples.filter((sample) => !sample.warmup)
    const report = {
      buildRoot,
      platform: process.platform,
      arch: process.arch,
      graphicsMode,
      plan,
      summary: samples.length
        ? {
            startupToEditorReadyMs: summarizeDurations(
              samples.map((sample) => sample.startupToEditorReadyMs),
            ),
            coldWindowReadyMs: summarizeDurations(
              samples.map((sample) => sample.coldWindowReadyMs),
            ),
            pooledWindowReadyMs: summarizeDurations(
              samples.map((sample) => sample.pooledWindowReadyMs),
            ),
          }
        : null,
      ...result,
    }
    const output =
      process.env.MARKLAB_PERFORMANCE_REPORT_PATH || testInfo.outputPath('startup-performance.json')
    await fs.mkdir(path.dirname(output), { recursive: true })
    await fs.writeFile(output, JSON.stringify(report, null, 2))
    await testInfo.attach('startup-performance', { path: output, contentType: 'application/json' })
    expect(result.failures).toEqual([])
    expect(samples).toHaveLength(plan.measuredRuns)
  } finally {
    await closeRendererServer(renderer.server)
  }
})
