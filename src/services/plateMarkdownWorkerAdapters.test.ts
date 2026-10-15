import { createSlateEditor } from 'platejs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import {
  loadPlateMarkdown,
  preloadPlateMarkdownWorkers,
  prewarmPlateMarkdown,
  serializePlateMarkdown,
  streamPlateMarkdown,
} from '@/services/plateMarkdownWorkerClient'
import type { PlateMarkdownWorkerRequest } from '@/workers/plateMarkdownWorkerProtocol'

const worker = vi.hoisted(() => ({ posted: vi.fn() }))

vi.mock('@/workers/plateMarkdownWorker?worker', () => ({
  default: class {
    onerror: ((event: ErrorEvent) => void) | null = null
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null
    postMessage(message: PlateMarkdownWorkerRequest) {
      worker.posted(message)
      if (message.operation === 'cancel') return
      const response = {
        id: message.id,
        ok: true,
        operation: message.operation,
        ...(message.operation === 'parse' ? { value: [] } : {}),
        ...(message.operation === 'serialize' ? { markdown: 'Serialized' } : {}),
        ...(message.operation === 'parse-stream' ? { done: true, value: [] } : {}),
      }
      this.onmessage?.({ data: response } as MessageEvent<unknown>)
    }
    terminate() {}
  },
}))

const createEditor = () => createSlateEditor({ plugins: [...plateMarkdownPlugins] })
const largeMarkdown = 'Large\n'.repeat(2_100)

describe('Markdown worker adapters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Worker', class {})
    worker.posted.mockClear()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('parses and serializes large values through the ordinary worker', async () => {
    const editor = createEditor()
    await expect(loadPlateMarkdown(editor, largeMarkdown)).resolves.toEqual([])
    await expect(
      serializePlateMarkdown(editor, [{ type: 'p', children: [{ text: 'x'.repeat(128_000) }] }]),
    ).resolves.toBe('Serialized')
    expect(worker.posted.mock.calls.map(([message]) => message.operation)).toEqual([
      'parse',
      'serialize',
    ])
    vi.advanceTimersByTime(30_000)
  })

  it('preloads and prepares streaming workers before parsing large Markdown', async () => {
    preloadPlateMarkdownWorkers(1)
    await expect(prewarmPlateMarkdown(largeMarkdown)).resolves.toBeUndefined()
    const onChunk = vi.fn()
    await expect(
      streamPlateMarkdown(createEditor(), largeMarkdown, onChunk),
    ).resolves.toBeUndefined()
    expect(worker.posted.mock.calls.map(([message]) => message.operation)).toEqual([
      'prepare-stream',
      'parse-stream',
    ])
    expect(onChunk).toHaveBeenCalledExactlyOnceWith([])
    vi.advanceTimersByTime(30_000)
  })

  it('passes small documents to the chunk consumer without worker construction', async () => {
    const onChunk = vi.fn()
    await streamPlateMarkdown(createEditor(), '# Small', onChunk)
    expect(onChunk).toHaveBeenCalledOnce()
    expect(worker.posted).not.toHaveBeenCalled()
  })

  it('rejects a large stream when workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined)
    preloadPlateMarkdownWorkers()
    await expect(streamPlateMarkdown(createEditor(), largeMarkdown, vi.fn())).rejects.toThrow(
      'Markdown worker is unavailable',
    )
    expect(worker.posted).not.toHaveBeenCalled()
  })
})
