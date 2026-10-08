// eslint-disable-next-line no-restricted-imports -- Performance helpers share sibling contracts.
import { summarizeOptionalMeasurements } from './performanceStatistics.js'
// eslint-disable-next-line no-restricted-imports -- Performance helpers share sibling contracts.
import type {
  ProcessMemoryDelta,
  ProcessMemorySnapshot,
  RendererMemorySnapshot,
} from './processMemoryObservability.js'

const rendererValues = (
  renderers: Array<RendererMemorySnapshot | null>,
  select: (renderer: RendererMemorySnapshot) => number,
) => renderers.map((renderer) => (renderer ? select(renderer) : null))

const summarizeRendererMemory = (renderers: Array<RendererMemorySnapshot | null>) => ({
  documents: summarizeOptionalMeasurements(
    rendererValues(renderers, (renderer) => renderer.documents),
  ),
  embedderHeapUsedBytes: summarizeOptionalMeasurements(
    rendererValues(renderers, (renderer) => renderer.embedderHeapUsedBytes),
  ),
  eventListeners: summarizeOptionalMeasurements(
    rendererValues(renderers, (renderer) => renderer.eventListeners),
  ),
  heapUsedBytes: summarizeOptionalMeasurements(
    rendererValues(renderers, (renderer) => renderer.heapUsedBytes),
  ),
  nodes: summarizeOptionalMeasurements(rendererValues(renderers, (renderer) => renderer.nodes)),
})

export const summarizeProcessMemorySnapshots = (snapshots: ProcessMemorySnapshot[]) => ({
  renderer: summarizeRendererMemory(snapshots.map((snapshot) => snapshot.renderer)),
  totals: {
    privateBytes: summarizeOptionalMeasurements(
      snapshots.map((snapshot) => snapshot.totals.privateBytes),
    ),
    privateProcessCount: summarizeOptionalMeasurements(
      snapshots.map((snapshot) => snapshot.totals.privateProcessCount),
    ),
    residentBytes: summarizeOptionalMeasurements(
      snapshots.map((snapshot) => snapshot.totals.residentBytes),
    ),
    residentProcessCount: summarizeOptionalMeasurements(
      snapshots.map((snapshot) => snapshot.totals.residentProcessCount),
    ),
  },
})

export const summarizeProcessMemoryDeltas = (deltas: ProcessMemoryDelta[]) => ({
  durationMs: summarizeOptionalMeasurements(deltas.map((delta) => delta.durationMs)),
  privateBytes: summarizeOptionalMeasurements(deltas.map((delta) => delta.privateBytes)),
  renderer: summarizeRendererMemory(deltas.map((delta) => delta.renderer)),
  residentBytes: summarizeOptionalMeasurements(deltas.map((delta) => delta.residentBytes)),
})
