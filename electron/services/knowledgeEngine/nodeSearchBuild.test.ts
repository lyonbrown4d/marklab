import { describe, expect, it, vi } from 'vitest'

import { buildNodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchBuild.js'
import { createMiniSearch } from '@electron/services/knowledgeEngine/nodeSearchConfig.js'
import { normalizeSearchDocument } from '@electron/services/knowledgeEngine/nodeSearchIndexSupport.js'
import type {
  NodeSearchWorkerBuildRequest,
  NodeSearchWorkerBuildResult,
} from '@electron/services/knowledgeEngine/nodeSearchWorkerMessages.js'

describe('buildNodeSearchIndex worker offload', () => {
  it('keeps small indexes on the current thread', async () => {
    const workerRunner = createWorkerRunner()

    const built = await buildNodeSearchIndex(
      [{ path: 'small.md', title: 'Small', content: 'local' }],
      normalizeSearchDocument,
      { workerRunner, workspaceIdentity: 'workspace-a' },
      () => true,
    )

    expect(workerRunner.run).not.toHaveBeenCalled()
    expect(built?.miniSearch.search('local')).toHaveLength(1)
  })

  it('offloads one complete large index and restores the serialized MiniSearch result', async () => {
    const workerRunner = createWorkerRunner(async (request) => workerResult(request))
    const documents = Array.from({ length: 5 }, (_, index) => ({
      path: `notes/${index}.md`,
      title: `Note ${index}`,
      content: `searchable ${index}`,
    }))

    const built = await buildNodeSearchIndex(
      documents,
      normalizeSearchDocument,
      {
        workerDocumentThreshold: 5,
        workerRunner,
        workspaceIdentity: 'workspace-a',
      },
      () => true,
    )

    expect(workerRunner.run).toHaveBeenCalledTimes(1)
    expect(workerRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({ documents, workspaceIdentity: 'workspace-a' }),
      expect.any(Object),
    )
    expect(built?.documents.size).toBe(5)
    expect(built?.miniSearch.search('searchable')).toHaveLength(5)
  })

  it('routes a 1k-document benchmark payload through one worker task', async () => {
    const workerRunner = createWorkerRunner(async (request) => workerResult(request))
    const yieldControl = vi.fn(async () => undefined)
    const documents = Array.from({ length: 1_000 }, (_, index) => ({
      path: `benchmark/${index}.md`,
      title: `Benchmark ${index}`,
      content: `worker benchmark content ${index}`,
    }))

    const built = await buildNodeSearchIndex(
      documents,
      normalizeSearchDocument,
      { workerRunner, workspaceIdentity: 'benchmark', yieldControl },
      () => true,
    )

    expect(workerRunner.run).toHaveBeenCalledTimes(1)
    expect(yieldControl).not.toHaveBeenCalled()
    expect(built?.documents.size).toBe(1_000)
  })

  it('offloads a content-heavy workspace below the document threshold', async () => {
    const workerRunner = createWorkerRunner(async (request) => workerResult(request))

    await buildNodeSearchIndex(
      [{ path: 'large.md', title: 'Large', content: 'content exceeds threshold' }],
      normalizeSearchDocument,
      {
        workerContentThresholdBytes: 8,
        workerDocumentThreshold: 512,
        workerRunner,
        workspaceIdentity: 'workspace-a',
      },
      () => true,
    )

    expect(workerRunner.run).toHaveBeenCalledTimes(1)
  })

  it('falls back to the chunked current-thread builder when the worker fails', async () => {
    const workerFailure = new Error('worker unavailable')
    const workerRunner = createWorkerRunner(async () => Promise.reject(workerFailure))
    const onWorkerFallback = vi.fn()
    const yieldControl = vi.fn(async () => undefined)

    const built = await buildNodeSearchIndex(
      [
        { path: 'one.md', title: 'One', content: 'fallback value' },
        { path: 'two.md', title: 'Two', content: 'fallback value' },
      ],
      normalizeSearchDocument,
      {
        chunkSize: 1,
        onWorkerFallback,
        workerDocumentThreshold: 2,
        workerRunner,
        workspaceIdentity: 'workspace-a',
        yieldControl,
      },
      () => true,
    )

    expect(onWorkerFallback).toHaveBeenCalledWith(workerFailure)
    expect(yieldControl).toHaveBeenCalled()
    expect(built?.miniSearch.search('fallback')).toHaveLength(2)
  })

  it('does not fall back or publish when an offloaded build is aborted', async () => {
    const controller = new AbortController()
    const onWorkerFallback = vi.fn()
    const workerRunner = createWorkerRunner(
      (_request, signal) =>
        new Promise<NodeSearchWorkerBuildResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const building = buildNodeSearchIndex(
      [{ path: 'large.md', title: 'Large', content: 'value' }],
      normalizeSearchDocument,
      {
        abortSignal: controller.signal,
        onWorkerFallback,
        workerDocumentThreshold: 1,
        workerRunner,
        workspaceIdentity: 'workspace-a',
      },
      () => true,
    )

    controller.abort()

    await expect(building).resolves.toBeNull()
    expect(onWorkerFallback).not.toHaveBeenCalled()
  })
})

const createWorkerRunner = (
  implementation: (
    request: NodeSearchWorkerBuildRequest,
    signal: AbortSignal,
  ) => Promise<NodeSearchWorkerBuildResult> = async () => {
    throw new Error('worker should not run')
  },
) => ({
  available: true,
  run: vi.fn(implementation),
})

const workerResult = (request: NodeSearchWorkerBuildRequest): NodeSearchWorkerBuildResult => {
  const miniSearch = createMiniSearch()
  const documents = request.documents.map(normalizeSearchDocument)
  miniSearch.addAll(documents)
  const serializedIndex = miniSearch.toJSON()
  return {
    buildDurationMs: 1,
    documentCount: documents.length,
    documents,
    indexBytes: Buffer.byteLength(JSON.stringify(serializedIndex)),
    serializedIndex,
    workspaceIdentity: request.workspaceIdentity,
  }
}
