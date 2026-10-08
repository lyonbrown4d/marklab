import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Performance tests share the production renderer server.
import { closeRendererServer, startRendererServer } from '../electron/electronTestHarness.js'
/* eslint-disable no-restricted-imports -- Performance tests use sibling helpers. */
import {
  PERFORMANCE_SAMPLE_PLAN,
  collectPerformanceSamples,
  summarizeDurations,
} from './performanceStatistics.js'
import {
  summarizeProcessMemoryDeltas,
  summarizeProcessMemorySnapshots,
} from './processMemoryStatistics.js'
import {
  runRealWorkspaceProfile,
  type RealWorkspaceProfileSample,
} from './realWorkspaceProfileScenario.js'
/* eslint-enable no-restricted-imports */

const sourceRoot = process.env.MARKLAB_E2E_WORKSPACE?.trim()

const withoutRawProfiles = (sample: RealWorkspaceProfileSample) => {
  const { electronOutput, rawProfiles, ...reportSample } = sample
  void electronOutput
  void rawProfiles
  return reportSample
}

const summarizeSamples = (samples: RealWorkspaceProfileSample[]) => ({
  initializationMs: summarizeDurations(
    samples.map((sample) => sample.initialization.openRequestToReadyMs),
  ),
  inputMaxFrameMs: summarizeDurations(samples.map((sample) => sample.input.frames.maxFrameMs)),
  inputLatencyP95Ms: summarizeDurations(
    samples.map((sample) => sample.input.latency.summary?.p95Ms ?? 0),
  ),
  memory: {
    deltas: {
      largeDocument: summarizeProcessMemoryDeltas(
        samples.map((sample) => sample.memory.deltas.largeDocument),
      ),
      map: summarizeProcessMemoryDeltas(samples.map((sample) => sample.memory.deltas.map)),
      total: summarizeProcessMemoryDeltas(samples.map((sample) => sample.memory.deltas.total)),
    },
    snapshots: {
      largeDocument: summarizeProcessMemorySnapshots(
        samples.map((sample) => sample.memory.snapshots.largeDocument),
      ),
      map: summarizeProcessMemorySnapshots(samples.map((sample) => sample.memory.snapshots.map)),
      smallDocument: summarizeProcessMemorySnapshots(
        samples.map((sample) => sample.memory.snapshots.smallDocument),
      ),
    },
  },
  mapMaxFrameMs: summarizeDurations(samples.map((sample) => sample.map.frames.maxFrameMs)),
  mapOpenMs: summarizeDurations(samples.map((sample) => sample.map.profile.durationMs)),
  searchMs: summarizeDurations(samples.map((sample) => sample.search.profile.durationMs)),
  scrollMaxFrameMs: summarizeDurations(samples.map((sample) => sample.scroll.frames.maxFrameMs)),
  scrollbarMaxFrameMs: summarizeDurations(
    samples.map((sample) => sample.scrollbar.frames.maxFrameMs),
  ),
  switchReadyMs: summarizeDurations(samples.map((sample) => sample.switchDocument.readyMs)),
})

test.describe('real workspace performance profile @performance @blackbox', () => {
  test.skip(!sourceRoot, 'Set MARKLAB_E2E_WORKSPACE to profile a real workspace.')
  let rendererServer: http.Server | undefined
  let rendererUrl = ''

  test.beforeAll(async () => {
    if (!sourceRoot || !fs.statSync(sourceRoot).isDirectory()) {
      throw new Error(`MARKLAB_E2E_WORKSPACE must be a directory: ${sourceRoot}`)
    }
    const renderer = await startRendererServer()
    rendererServer = renderer.server
    rendererUrl = renderer.url
  })

  test.afterAll(async () => closeRendererServer(rendererServer))

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('profiles cold open, file switching, scrolling, typing, search, and map rendering', async ({}, testInfo) => {
    test.setTimeout(600_000)
    const collection = await collectPerformanceSamples<RealWorkspaceProfileSample>({
      maxAttempts: (PERFORMANCE_SAMPLE_PLAN.warmupRuns + PERFORMANCE_SAMPLE_PLAN.measuredRuns) * 2,
      plan: PERFORMANCE_SAMPLE_PLAN,
      runSample: ({ attemptIndex, warmup }) =>
        runRealWorkspaceProfile({
          rendererUrl,
          runIndex: attemptIndex,
          sourceRoot: sourceRoot!,
          testInfo,
          warmup,
        }),
    })
    const allSamples = collection.samples
    const measured = allSamples.filter((sample) => !sample.warmup)
    const warmup = allSamples.find((sample) => sample.warmup)
    const report = {
      generatedAt: new Date().toISOString(),
      attemptCount: collection.attemptCount,
      attemptFailures: collection.failures,
      samplePlan: PERFORMANCE_SAMPLE_PLAN,
      sourceRoot,
      reliability: {
        attemptedRuns: collection.attemptCount,
        failedRunRate: Number((collection.failures.length / collection.attemptCount).toFixed(4)),
        failedRuns: collection.failures.length,
        successfulRuns: collection.samples.length,
      },
      summary: summarizeSamples(measured),
      samples: measured.map(withoutRawProfiles),
      warmup: warmup ? withoutRawProfiles(warmup) : undefined,
    }
    const auditDirectory = path.resolve('output/playwright/performance-audit')
    const reportPath = path.join(auditDirectory, 'real-workspace-performance-profile.json')
    const cpuProfilePath = path.join(auditDirectory, 'real-workspace-cpu-profiles.json')
    const electronLogPath = path.join(auditDirectory, 'real-workspace-electron.log')
    fs.mkdirSync(auditDirectory, { recursive: true })
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    fs.writeFileSync(
      cpuProfilePath,
      `${JSON.stringify(measured[0]?.rawProfiles ?? {}, null, 2)}\n`,
      'utf8',
    )
    fs.writeFileSync(
      electronLogPath,
      measured
        .map((sample) => [`--- run ${sample.runIndex} ---`, ...sample.electronOutput].join('\n'))
        .join('\n'),
      'utf8',
    )
    await testInfo.attach('real-workspace-performance-profile.json', {
      path: reportPath,
      contentType: 'application/json',
    })
    await testInfo.attach('real-workspace-cpu-profiles.json', {
      path: cpuProfilePath,
      contentType: 'application/json',
    })
    await testInfo.attach('real-workspace-electron.log', {
      path: electronLogPath,
      contentType: 'text/plain',
    })
    expect(measured).toHaveLength(PERFORMANCE_SAMPLE_PLAN.measuredRuns)
    expect(collection.failures, 'performance sample attempts failed').toEqual([])
    expect(measured.flatMap((sample) => sample.rendererErrors)).toEqual([])
  })
})
