/// <reference types="mocha" />
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Opt-in native performance benchmark only. */
import { fixturePaths } from './fixturePaths.js'
import { switchToWorkspace } from './nativeHarness.js'
import { nativePerformanceScenario } from './performanceUi.js'
import { findApplicationProcess, sampleProcessTree } from './performanceProcess.js'
import type { RealWorkspace } from '../performance/realWorkspaceFixture.js'
import {
  installFrameProbe,
  collectFrameProbe,
  summarizeFrameProbe,
} from '../performance/frameProbe.js'
import {
  summarizeDurations,
  PERFORMANCE_SAMPLE_PLAN,
} from '../performance/performanceStatistics.js'
import { pathToFileViewRoute } from '../../src/logic/routing.js'
/* eslint-enable no-restricted-imports */

describe('real workspace native performance', () => {
  it('measures the real local corpus through native services and WebKit editing', async () => {
    const fixture = fixturePaths()
    assert.ok(fixture.performance, 'Set MARKLAB_PERFORMANCE_WORKSPACE')
    const root = fixture.performance
    const source = JSON.parse(
      await fs.readFile(path.join(fixture.root, 'performance.json'), 'utf8'),
    ) as RealWorkspace
    const markdown = source.files
      .filter((file) => /\.md$/i.test(file.path))
      .sort((a, b) => b.bytes - a.bytes)
    const workbooks = source.files.filter((file) => /\.xlsx$/i.test(file.path))
    const documents = await Promise.all(
      markdown.slice(0, 3).map(async (file) => ({
        path: file.path,
        route: pathToFileViewRoute(file.path, 'edit'),
        heading:
          (await fs.readFile(path.join(root, file.path), 'utf8'))
            .split('\n')
            .find((line) => /^#+\s+/.test(line))
            ?.replace(/^#+\s+/, '')
            .trim() ?? '',
      })),
    )
    await switchToWorkspace(root)
    await browser.setTimeout({ script: 600_000 })
    const owner = await findApplicationProcess(root)
    const baseline = await sampleProcessTree(owner.pid, owner.ticks)
    const memory: Array<{ at: number } & Awaited<ReturnType<typeof sampleProcessTree>>> = []
    let active = true
    const sampling = (async () => {
      while (active) {
        memory.push({ at: Date.now(), ...(await sampleProcessTree(owner.pid, owner.ticks)) })
        await delay(1000)
      }
    })()
    let result: Awaited<ReturnType<typeof nativePerformanceScenario>>
    try {
      const script = `const install = ${installFrameProbe.toString()}; const collect = ${collectFrameProbe.toString()}; return (${nativePerformanceScenario.toString()})(arguments[0], install, collect);`
      result = (await browser.execute(script, {
        documents,
        markdown: markdown.map((file) => file.path),
        workbooks: workbooks.map((file) => ({
          path: file.path,
          name: path.basename(file.path),
          route: pathToFileViewRoute(file.path, 'preview'),
        })),
        ...PERFORMANCE_SAMPLE_PLAN,
      })) as typeof result
    } finally {
      active = false
      await sampling
    }
    const beforeIdle = await sampleProcessTree(owner.pid, owner.ticks)
    const idleStarted = performance.now()
    await delay(2000)
    const idle = await sampleProcessTree(owner.pid, owner.ticks)
    const samples = result.samples.map(({ frames, ...sample }) => ({
      ...sample,
      scrollFrames: summarizeFrameProbe(frames),
    }))
    const measured = samples.filter((sample) => !sample.warmup)
    const summary = {
      bufferReadMs: summarizeDurations(measured.flatMap((sample) => sample.bufferReads)),
      searchMs: summarizeDurations(measured.map((sample) => sample.searchMs)),
      graphMs: summarizeDurations(measured.map((sample) => sample.graphMs)),
      graphUiMs: summarizeDurations(measured.map((sample) => sample.graphUiMs)),
      documentActivationMs: summarizeDurations(
        measured.flatMap((sample) => sample.documentOpens.map((doc) => doc.ms)),
      ),
      editToRustFlushAcknowledgmentMs: summarizeDurations(
        measured.map((sample) => sample.editToRustFlushAcknowledgmentMs),
      ),
    }
    const report = {
      build: 'debug native E2E with production renderer',
      input: 'WebKit editing command; appended edits remain in the disposable copy',
      documentActivation:
        'Includes reactivating the document already selected at the start of each run',
      scrollWorkload: '24 alternating full-document scroll jumps per sample',
      source: {
        path: source.source,
        files: source.files.length,
        bytes: source.bytes,
        markdown: markdown.length,
        workbooks: workbooks.length,
      },
      environment: {
        platform: os.platform(),
        release: os.release(),
        cpus: os.cpus().length,
        ...result.webview,
      },
      runnerLaunchToFirstRootReadyMs:
        result.firstReady - Number(process.env.MARKLAB_PERFORMANCE_LAUNCH_EPOCH_MS),
      baseline,
      memory,
      samples,
      summary,
      postWorkload: {
        observationDelayMs: 2000,
        ...idle,
        cpuPercentOfOneCore:
          (100 * (idle.cpuMs - beforeIdle.cpuMs)) / (performance.now() - idleStarted),
      },
    }
    await fs.mkdir('test-results/tauri/performance', { recursive: true })
    await fs.writeFile(
      'test-results/tauri/performance/workspace.json',
      JSON.stringify(report, null, 2),
    )
    assert.equal(
      samples.length,
      PERFORMANCE_SAMPLE_PLAN.warmupRuns + PERFORMANCE_SAMPLE_PLAN.measuredRuns,
    )
    for (const sample of samples) {
      assert.ok(sample.scrollFrames.frameCount >= 24)
      assert.equal(sample.scrollFrames.blankFrames, 0)
    }
    assert.ok(
      (await fs.readFile(path.join(root, documents[0]!.path), 'utf8')).includes(
        `native-performance-${samples.length - 1}`,
      ),
    )
  }).timeout(660_000)
})
