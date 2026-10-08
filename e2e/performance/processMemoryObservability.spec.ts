import { expect, test } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Pure performance helper contract uses its sibling module.
import {
  diffMemorySnapshots,
  normalizeAppProcessMetrics,
  type ProcessMemorySnapshot,
} from './processMemoryObservability.js'

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
})
