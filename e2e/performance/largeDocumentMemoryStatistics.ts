// eslint-disable-next-line no-restricted-imports -- Performance helpers share sibling contracts.
import {
  summarizeProcessMemoryDeltas,
  summarizeProcessMemorySnapshots,
} from './processMemoryStatistics.js'
// eslint-disable-next-line no-restricted-imports -- Performance helpers share sibling contracts.
import type { ProcessMemoryDelta, ProcessMemorySnapshot } from './processMemoryObservability.js'

type LargeDocumentMemorySample = {
  memory: {
    deltas: {
      interactions: ProcessMemoryDelta
      openLargeDocument: ProcessMemoryDelta
      total: ProcessMemoryDelta
    }
    snapshots: {
      afterInteractions: ProcessMemorySnapshot
      afterOpen: ProcessMemorySnapshot
      beforeOpen: ProcessMemorySnapshot
    }
  }
}

export const summarizeLargeDocumentMemory = (samples: LargeDocumentMemorySample[]) => ({
  deltas: {
    interactions: summarizeProcessMemoryDeltas(
      samples.map((sample) => sample.memory.deltas.interactions),
    ),
    openLargeDocument: summarizeProcessMemoryDeltas(
      samples.map((sample) => sample.memory.deltas.openLargeDocument),
    ),
    total: summarizeProcessMemoryDeltas(samples.map((sample) => sample.memory.deltas.total)),
  },
  snapshots: {
    afterInteractions: summarizeProcessMemorySnapshots(
      samples.map((sample) => sample.memory.snapshots.afterInteractions),
    ),
    afterOpen: summarizeProcessMemorySnapshots(
      samples.map((sample) => sample.memory.snapshots.afterOpen),
    ),
    beforeOpen: summarizeProcessMemorySnapshots(
      samples.map((sample) => sample.memory.snapshots.beforeOpen),
    ),
  },
})
