import type { Page } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Performance helpers share the Electron harness contract.
import type { ElectronPerformanceSession } from './electronPerformanceHarness.js'

export type ProcessMemoryKind = 'gpu' | 'main' | 'other' | 'renderer' | 'utility'

type RawProcessMetric = {
  memory?: {
    peakWorkingSetSize?: number
    privateBytes?: number
    workingSetSize?: number
  }
  name?: string
  pid: number
  serviceName?: string
  type: string
}

export type NormalizedProcessMemory = {
  kind: ProcessMemoryKind
  name: string | null
  peakResidentBytes: number | null
  pid: number
  privateBytes: number | null
  residentBytes: number | null
  type: string
}

export type RendererMemorySnapshot = {
  documents: number
  embedderHeapUsedBytes: number
  eventListeners: number
  heapUsedBytes: number
  nodes: number
}

export type ProcessMemorySnapshot = {
  capturedAtEpochMs: number
  platform: NodeJS.Platform
  processes: NormalizedProcessMemory[]
  renderer: RendererMemorySnapshot | null
  totals: {
    privateBytes: number | null
    privateProcessCount: number
    residentBytes: number | null
    residentProcessCount: number
  }
}

export type ProcessMemoryDelta = {
  durationMs: number
  privateBytes: number | null
  renderer: RendererMemorySnapshot | null
  residentBytes: number | null
}

const kilobytesToBytes = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value * 1_024)
    : null

const processKind = (type: string): ProcessMemoryKind => {
  switch (type.toLowerCase()) {
    case 'browser':
      return 'main'
    case 'tab':
      return 'renderer'
    case 'utility':
      return 'utility'
    case 'gpu':
      return 'gpu'
    default:
      return 'other'
  }
}

const sumAvailable = (values: Array<number | null>) => {
  const available = values.filter((value): value is number => value !== null)
  return available.length > 0 ? available.reduce((total, value) => total + value, 0) : null
}

export const normalizeAppProcessMetrics = (
  metrics: RawProcessMetric[],
  platform: NodeJS.Platform,
  capturedAtEpochMs = Date.now(),
): ProcessMemorySnapshot => {
  const processes = metrics
    .map<NormalizedProcessMemory>((metric) => ({
      kind: processKind(metric.type),
      name: metric.serviceName ?? metric.name ?? null,
      peakResidentBytes: kilobytesToBytes(metric.memory?.peakWorkingSetSize),
      pid: metric.pid,
      privateBytes: kilobytesToBytes(metric.memory?.privateBytes),
      residentBytes: kilobytesToBytes(metric.memory?.workingSetSize),
      type: metric.type,
    }))
    .sort((left, right) => left.pid - right.pid)
  const privateValues = processes.map((process) => process.privateBytes)
  const residentValues = processes.map((process) => process.residentBytes)
  return {
    capturedAtEpochMs,
    platform,
    processes,
    renderer: null,
    totals: {
      privateBytes: sumAvailable(privateValues),
      privateProcessCount: privateValues.filter((value) => value !== null).length,
      residentBytes: sumAvailable(residentValues),
      residentProcessCount: residentValues.filter((value) => value !== null).length,
    },
  }
}

const subtractNullable = (before: number | null, after: number | null) =>
  before === null || after === null ? null : after - before

const diffRenderer = (
  before: RendererMemorySnapshot | null,
  after: RendererMemorySnapshot | null,
): RendererMemorySnapshot | null =>
  before && after
    ? {
        documents: after.documents - before.documents,
        embedderHeapUsedBytes: after.embedderHeapUsedBytes - before.embedderHeapUsedBytes,
        eventListeners: after.eventListeners - before.eventListeners,
        heapUsedBytes: after.heapUsedBytes - before.heapUsedBytes,
        nodes: after.nodes - before.nodes,
      }
    : null

export const diffMemorySnapshots = (
  before: ProcessMemorySnapshot,
  after: ProcessMemorySnapshot,
): ProcessMemoryDelta => ({
  durationMs: Math.max(0, after.capturedAtEpochMs - before.capturedAtEpochMs),
  privateBytes: subtractNullable(before.totals.privateBytes, after.totals.privateBytes),
  renderer: diffRenderer(before.renderer, after.renderer),
  residentBytes: subtractNullable(before.totals.residentBytes, after.totals.residentBytes),
})

const captureRendererMemory = async (page: Page): Promise<RendererMemorySnapshot> => {
  const cdp = await page.context().newCDPSession(page)
  try {
    const [dom, heap] = await Promise.all([
      cdp.send('Memory.getDOMCounters') as Promise<{
        documents: number
        jsEventListeners: number
        nodes: number
      }>,
      cdp.send('Runtime.getHeapUsage') as Promise<{
        embedderHeapUsedSize: number
        usedSize: number
      }>,
    ])
    return {
      documents: dom.documents,
      embedderHeapUsedBytes: heap.embedderHeapUsedSize,
      eventListeners: dom.jsEventListeners,
      heapUsedBytes: heap.usedSize,
      nodes: dom.nodes,
    }
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

export const captureProcessMemorySnapshot = async (
  session: ElectronPerformanceSession,
  page?: Page,
): Promise<ProcessMemorySnapshot> => {
  const { capturedAtEpochMs, metrics, platform } = await session.app.evaluate(({ app }) => ({
    capturedAtEpochMs: Date.now(),
    metrics: app.getAppMetrics().map((metric) => ({
      memory: metric.memory,
      name: metric.name,
      pid: metric.pid,
      serviceName: metric.serviceName,
      type: metric.type,
    })),
    platform: process.platform,
  }))
  const snapshot = normalizeAppProcessMetrics(metrics, platform, capturedAtEpochMs)
  return {
    ...snapshot,
    renderer: page ? await captureRendererMemory(page) : null,
  }
}
