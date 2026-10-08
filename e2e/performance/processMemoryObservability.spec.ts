import { expect, test } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Pure performance helper contract uses its sibling module.
import {
  diffMemorySnapshots,
  normalizeAppProcessMetrics,
  type ProcessMemoryDelta,
  type ProcessMemorySnapshot,
} from './processMemoryObservability.js'
// eslint-disable-next-line no-restricted-imports -- Pure performance helper contract uses its sibling module.
import {
  summarizeProcessMemoryDeltas,
  summarizeProcessMemorySnapshots,
} from './processMemoryStatistics.js'
// eslint-disable-next-line no-restricted-imports -- Pure performance helper contract uses its sibling module.
import { summarizeLargeDocumentMemory } from './largeDocumentMemoryStatistics.js'

test.describe('process memory observability', () => {
  test('normalizes Electron memory metrics and preserves unavailable private memory', () => {
    const snapshot = normalizeAppProcessMetrics(
      [
        {
          memory: { privateBytes: 700, workingSetSize: 1_000 },
          pid: 10,
          type: 'Browser',
        },
        {
          memory: { privateBytes: 0, workingSetSize: 500 },
          pid: 11,
          type: 'Tab',
        },
        {
          memory: { privateBytes: 200, workingSetSize: 300 },
          pid: 12,
          serviceName: 'node.mojom.NodeService',
          type: 'Utility',
        },
      ],
      'darwin',
      42,
    )

    expect(snapshot).toMatchObject({
      capturedAtEpochMs: 42,
      platform: 'darwin',
      totals: {
        privateBytes: 921_600,
        privateProcessCount: 2,
        residentBytes: 1_843_200,
        residentProcessCount: 3,
      },
    })
    expect(snapshot.processes.map(({ kind, privateBytes }) => ({ kind, privateBytes }))).toEqual([
      { kind: 'main', privateBytes: 716_800 },
      { kind: 'renderer', privateBytes: null },
      { kind: 'utility', privateBytes: 204_800 },
    ])

    const withoutPrivateMemory = normalizeAppProcessMetrics(
      [{ memory: { workingSetSize: 250 }, pid: 20, type: 'GPU' }],
      'linux',
    )
    expect(withoutPrivateMemory.totals.privateBytes).toBeNull()
    expect(withoutPrivateMemory.totals.privateProcessCount).toBe(0)
  })

  test('reports relative process and renderer deltas without inventing missing values', () => {
    const before: ProcessMemorySnapshot = {
      capturedAtEpochMs: 1,
      platform: 'linux',
      processes: [],
      renderer: {
        documents: 1,
        embedderHeapUsedBytes: 10,
        eventListeners: 2,
        heapUsedBytes: 100,
        nodes: 20,
      },
      totals: {
        privateBytes: null,
        privateProcessCount: 0,
        residentBytes: 1_000,
        residentProcessCount: 2,
      },
    }
    const after: ProcessMemorySnapshot = {
      ...before,
      capturedAtEpochMs: 2,
      renderer: {
        documents: 2,
        embedderHeapUsedBytes: 15,
        eventListeners: 5,
        heapUsedBytes: 160,
        nodes: 35,
      },
      totals: { ...before.totals, residentBytes: 1_250 },
    }

    expect(diffMemorySnapshots(before, after)).toEqual({
      durationMs: 1,
      privateBytes: null,
      renderer: {
        documents: 1,
        embedderHeapUsedBytes: 5,
        eventListeners: 3,
        heapUsedBytes: 60,
        nodes: 15,
      },
      residentBytes: 250,
    })
  })

  test('summarizes memory distributions and reports unavailable measurement coverage', () => {
    const snapshots: ProcessMemorySnapshot[] = [
      {
        capturedAtEpochMs: 1,
        platform: 'linux',
        processes: [],
        renderer: {
          documents: 2,
          embedderHeapUsedBytes: 200,
          eventListeners: 20,
          heapUsedBytes: 100,
          nodes: 10,
        },
        totals: {
          privateBytes: null,
          privateProcessCount: 0,
          residentBytes: 1_000,
          residentProcessCount: 2,
        },
      },
      {
        capturedAtEpochMs: 2,
        platform: 'linux',
        processes: [],
        renderer: null,
        totals: {
          privateBytes: 900,
          privateProcessCount: 2,
          residentBytes: 1_200,
          residentProcessCount: 3,
        },
      },
    ]
    const deltas: ProcessMemoryDelta[] = [
      {
        durationMs: 10,
        privateBytes: null,
        renderer: snapshots[0]?.renderer ?? null,
        residentBytes: 200,
      },
      {
        durationMs: 12,
        privateBytes: 100,
        renderer: null,
        residentBytes: 400,
      },
    ]

    expect(summarizeProcessMemorySnapshots(snapshots)).toMatchObject({
      renderer: {
        heapUsedBytes: {
          availableSampleCount: 1,
          missingSampleCount: 1,
        },
      },
      totals: {
        privateBytes: {
          availableSampleCount: 1,
          missingSampleCount: 1,
        },
        residentBytes: {
          distribution: { mean: 1_100, median: 1_100, sampleCount: 2 },
        },
      },
    })
    expect(summarizeProcessMemoryDeltas(deltas)).toMatchObject({
      durationMs: { distribution: { mean: 11, sampleCount: 2 } },
      residentBytes: { distribution: { mean: 300, sampleCount: 2 } },
      renderer: {
        nodes: { availableSampleCount: 1, missingSampleCount: 1 },
      },
    })
    expect(
      summarizeLargeDocumentMemory(
        snapshots.map((snapshot, index) => ({
          memory: {
            deltas: {
              interactions: deltas[index]!,
              openLargeDocument: deltas[index]!,
              total: deltas[index]!,
            },
            snapshots: {
              afterInteractions: snapshot,
              afterOpen: snapshot,
              beforeOpen: snapshot,
            },
          },
        })),
      ),
    ).toMatchObject({
      deltas: { total: { residentBytes: { distribution: { mean: 300 } } } },
      snapshots: { afterOpen: { totals: { residentBytes: { distribution: { mean: 1_100 } } } } },
    })
  })
})
