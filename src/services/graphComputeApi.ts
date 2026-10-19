import { z } from 'zod'
import { truncate } from 'lodash-es'
import { invoke } from '@/runtime/ipc'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

const id = z.string().min(1).max(1_024)
const edge = z.object({ source: id, target: id }).strict()
const layoutInput = z
  .object({
    mode: z.enum(['overview', 'focus']),
    nodes: z.array(
      z
        .object({
          id,
          width: z.number().min(24).max(20_000),
          height: z.number().min(24).max(20_000),
          group: z.string().max(1_024).optional(),
        })
        .strict(),
    ),
    edges: z.array(edge),
  })
  .strict()
const communityInput = z
  .object({
    nodes: z.array(z.object({ id, label: z.string() }).strict()),
    edges: z.array(edge),
  })
  .strict()
const position = z
  .object({
    id,
    x: z.number().min(-10_000_000).max(10_000_000),
    y: z.number().min(-10_000_000).max(10_000_000),
  })
  .strict()
const layoutResult = z
  .object({
    positions: z.array(position),
    engineVersion: z.literal('native-workspace-map-v1'),
  })
  .strict()
const communityResult = z
  .object({
    communities: z.array(
      z
        .object({
          id: z.string().min(1).max(128),
          label: z.string().max(4_096),
          nodeIds: z.array(id).max(80),
          unlinkedPage: z.number().int().positive().nullable().optional(),
        })
        .strict(),
    ),
  })
  .strict()

export type GraphLayoutComputeInput = z.infer<typeof layoutInput>
export type GraphCommunityInput = z.infer<typeof communityInput>
export type GraphLayoutPosition = z.infer<typeof position>
export type GraphCommunity = z.infer<typeof communityResult>['communities'][number]

const cancelled = () => new DOMException('Graph computation was cancelled.', 'AbortError')
const displayLabel = (label: string) => {
  let result = ''
  let scalars = 0
  // Lodash respects emoji sequences, which can contain arbitrarily many scalar
  // values. This second bound also guarantees the native 4096-byte UTF-8 limit.
  for (const character of truncate(label, { length: 256 })) {
    if (scalars === 1_023) return `${result}…`
    result += character
    scalars += 1
  }
  return result
}
const compute = async (
  command: string,
  input: GraphLayoutComputeInput | GraphCommunityInput,
  signal?: AbortSignal,
) => {
  if (signal?.aborted) throw cancelled()
  const requestId = crypto.randomUUID()
  let rejectAbort: ((error: DOMException) => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const abort = () => {
    rejectAbort?.(cancelled())
    void invoke('fs_cancel_graph_computation', { requestId }).catch((error: unknown) => {
      rendererDiagnostics.warn('graph.compute', 'cancel-failed', error)
    })
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    return await Promise.race([invoke<unknown>(command, { ...input, requestId }), aborted])
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

export const graphComputeApi = {
  async layout(input: GraphLayoutComputeInput, signal?: AbortSignal) {
    return layoutResult.parse(
      await compute('fs_compute_workspace_graph_layout', layoutInput.parse(input), signal),
    )
  },
  async communities(input: GraphCommunityInput, signal?: AbortSignal) {
    return communityResult.parse(
      await compute(
        'fs_partition_workspace_graph',
        communityInput.parse({
          ...input,
          nodes: input.nodes.map((node) => ({
            ...node,
            label: displayLabel(node.label),
          })),
        }),
        signal,
      ),
    )
  },
}
