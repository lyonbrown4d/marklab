import { performance } from 'node:perf_hooks'
import type { CDPSession, Page } from '@playwright/test'

type CpuNode = {
  id: number
  callFrame: { functionName: string; lineNumber: number; url: string }
}

type CpuProfile = {
  nodes: CpuNode[]
  samples?: number[]
  timeDeltas?: number[]
}

type PerformanceMetric = { name: string; value: number }

const readPerformanceMetrics = async (session: CDPSession) => {
  const response = (await session.send('Performance.getMetrics')) as {
    metrics: PerformanceMetric[]
  }
  return Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]))
}

const readMemoryMetrics = async (session: CDPSession) => {
  const [dom, heap] = await Promise.all([
    session.send('Memory.getDOMCounters') as Promise<{
      documents: number
      jsEventListeners: number
      nodes: number
    }>,
    session.send('Runtime.getHeapUsage') as Promise<{
      embedderHeapUsedSize: number
      usedSize: number
    }>,
  ])
  return { dom, heap }
}

const millisecondsDelta = (
  before: Record<string, number>,
  after: Record<string, number>,
  name: string,
) => Number((((after[name] ?? 0) - (before[name] ?? 0)) * 1_000).toFixed(2))

const summarizeCpuProfile = (profile: CpuProfile) => {
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]))
  const selfTimeByNode = new Map<number, number>()
  for (const [index, nodeId] of (profile.samples ?? []).entries()) {
    selfTimeByNode.set(
      nodeId,
      (selfTimeByNode.get(nodeId) ?? 0) + (profile.timeDeltas?.[index] ?? 0),
    )
  }
  const topFunctions = [...selfTimeByNode.entries()]
    .map(([nodeId, microseconds]) => {
      const frame = nodesById.get(nodeId)?.callFrame
      return {
        functionName: frame?.functionName || '(anonymous)',
        line: (frame?.lineNumber ?? -1) + 1,
        selfTimeMs: Number((microseconds / 1_000).toFixed(2)),
        url: frame?.url ?? '',
      }
    })
    .sort((left, right) => right.selfTimeMs - left.selfTimeMs)
    .slice(0, 25)
  return {
    sampleCount: profile.samples?.length ?? 0,
    sampledTimeMs: Number(
      ((profile.timeDeltas ?? []).reduce((total, value) => total + value, 0) / 1_000).toFixed(2),
    ),
    topFunctions,
  }
}

export const profileRendererInteraction = async <Result>(
  page: Page,
  label: string,
  action: () => Promise<Result>,
) => {
  const session = await page.context().newCDPSession(page)
  await Promise.all([session.send('Performance.enable'), session.send('Profiler.enable')])
  await session.send('Profiler.setSamplingInterval', { interval: 100 })
  const [beforePerformance, beforeMemory] = await Promise.all([
    readPerformanceMetrics(session),
    readMemoryMetrics(session),
  ])
  await session.send('Profiler.start')
  const startedAt = performance.now()
  try {
    const result = await action()
    const durationMs = performance.now() - startedAt
    const { profile } = (await session.send('Profiler.stop')) as { profile: CpuProfile }
    const [afterPerformance, afterMemory] = await Promise.all([
      readPerformanceMetrics(session),
      readMemoryMetrics(session),
    ])
    return {
      profile: {
        cpu: summarizeCpuProfile(profile),
        durationMs: Number(durationMs.toFixed(2)),
        label,
        memory: {
          after: afterMemory,
          before: beforeMemory,
          usedHeapDeltaBytes: afterMemory.heap.usedSize - beforeMemory.heap.usedSize,
        },
        rawCpuProfile: profile,
        rendererWork: {
          layoutMs: millisecondsDelta(beforePerformance, afterPerformance, 'LayoutDuration'),
          recalcStyleMs: millisecondsDelta(
            beforePerformance,
            afterPerformance,
            'RecalcStyleDuration',
          ),
          scriptMs: millisecondsDelta(beforePerformance, afterPerformance, 'ScriptDuration'),
          taskMs: millisecondsDelta(beforePerformance, afterPerformance, 'TaskDuration'),
        },
      },
      result,
    }
  } finally {
    await session.detach().catch(() => undefined)
  }
}

export type RendererInteractionProfile = Awaited<
  ReturnType<typeof profileRendererInteraction<unknown>>
>['profile']
