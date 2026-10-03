import type { Value } from 'platejs'
import { createSlateEditor } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import { serializePlateMarkdown as serializePlateMarkdownValue } from '@/components/plate/plateMarkdownSerialization'
import {
  loadPlateMarkdown,
  PlateMarkdownWorkerClient,
  prewarmPlateMarkdown,
  serializePlateMarkdown,
  shouldParsePlateMarkdownInWorker,
  shouldSerializePlateValueInWorker,
} from '@/services/plateMarkdownWorkerClient'

type WorkerMessage = {
  id: number
  markdown?: string
  operation: 'cancel' | 'parse' | 'parse-next' | 'parse-stream' | 'prepare-stream' | 'serialize'
  value?: Value
}

class FakeWorker {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  readonly postMessage = vi.fn<(message: WorkerMessage) => void>()
  readonly terminate = vi.fn()

  respond(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

describe('Plate Markdown worker policy', () => {
  it('keeps small documents on the main thread', () => {
    expect(shouldParsePlateMarkdownInWorker('# Note\n\nSmall paragraph')).toBe(false)
  })

  it('moves line-heavy and character-heavy documents off the main thread', () => {
    expect(shouldParsePlateMarkdownInWorker('line\n'.repeat(2_100))).toBe(true)
    expect(shouldParsePlateMarkdownInWorker('x'.repeat(128_000))).toBe(true)
  })

  it('moves block-heavy and character-heavy editor values off the main thread', () => {
    expect(shouldSerializePlateValueInWorker([{ type: 'p', children: [{ text: 'small' }] }])).toBe(
      false,
    )
    expect(
      shouldSerializePlateValueInWorker(
        Array.from({ length: 2_100 }, (_, index) => ({
          type: 'p',
          children: [{ text: `line ${index}` }],
        })),
      ),
    ).toBe(true)
    expect(
      shouldSerializePlateValueInWorker([{ type: 'p', children: [{ text: 'x'.repeat(128_000) }] }]),
    ).toBe(true)
  })
})

describe('PlateMarkdownWorkerClient', () => {
  it('cleans up a normal parse when worker construction fails', async () => {
    const client = new PlateMarkdownWorkerClient(() => {
      throw new Error('Worker construction failed')
    })
    const controller = new AbortController()
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')

    await expect(client.parse('Large', controller.signal)).rejects.toThrow(
      'Worker construction failed',
    )
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
    await expect(client.parse('Retry')).rejects.toThrow('Worker construction failed')
  })

  it('terminates and rejects normal requests when the worker channel throws', async () => {
    const worker = new FakeWorker()
    worker.postMessage.mockImplementation(() => {
      throw new Error('Worker channel closed')
    })
    const client = new PlateMarkdownWorkerClient(() => worker)

    await expect(client.serialize([{ type: 'p', children: [{ text: 'Large' }] }])).rejects.toThrow(
      'Worker channel closed',
    )
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('uses typed parse and serialize requests', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const parsedValue: Value = [{ type: 'p', children: [{ text: 'Parsed' }] }]
    const parsePromise = client.parse('# Parsed')

    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: 1,
      markdown: '# Parsed',
      operation: 'parse',
    })
    worker.respond({ id: 1, ok: true, operation: 'parse', value: parsedValue })
    await expect(parsePromise).resolves.toEqual(parsedValue)

    const serializePromise = client.serialize(parsedValue)
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: 2,
      operation: 'serialize',
      value: parsedValue,
    })
    worker.respond({ id: 2, markdown: '# Parsed\n', ok: true, operation: 'serialize' })
    await expect(serializePromise).resolves.toBe('# Parsed\n')
  })

  it('passes serialized Markdown through without rewriting document characters', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const value: Value = [{ type: 'p', children: [{ text: 'before\u200bafter \\[!NOTE]' }] }]
    const request = client.serialize(value)
    const markdown = 'before\u200bafter \\[!NOTE]\n'

    worker.respond({ id: 1, markdown, ok: true, operation: 'serialize' })

    await expect(request).resolves.toBe(markdown)
  })

  it('rejects aborted work and ignores its late response', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const controller = new AbortController()
    const aborted = client.serialize(
      [{ type: 'p', children: [{ text: 'Old' }] }],
      controller.signal,
    )

    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    worker.respond({ id: 1, markdown: 'Old', ok: true, operation: 'serialize' })

    const latest = client.serialize([{ type: 'p', children: [{ text: 'Latest' }] }])
    worker.respond({ id: 2, markdown: 'Latest', ok: true, operation: 'serialize' })
    await expect(latest).resolves.toBe('Latest')
  })

  it('rejects a mismatched worker response instead of resolving the wrong request type', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const request = client.parse('Text')

    worker.respond({ id: 1, markdown: 'Text', ok: true, operation: 'serialize' })

    await expect(request).rejects.toThrow('Unexpected Markdown worker response')
  })

  it('rejects structured worker failures', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const request = client.serialize([{ type: 'p', children: [{ text: 'Text' }] }])

    worker.respond({
      error: 'Serialization failed',
      id: 1,
      ok: false,
      operation: 'serialize',
    })

    await expect(request).rejects.toThrow('Serialization failed')
  })
})

describe('serializePlateMarkdown fallback', () => {
  it('uses the same lossless serializer when workers are unavailable', () => {
    const editor = createSlateEditor({ plugins: [...plateMarkdownPlugins] })
    const value: Value = [{ type: 'p', children: [{ text: 'before\u200bafter \\[!NOTE]' }] }]

    expect(serializePlateMarkdown(editor, value)).toBe(serializePlateMarkdownValue(editor, value))
  })

  it('keeps HTML comments intact through the main-thread parser fallback', () => {
    const editor = createSlateEditor({ plugins: [...plateMarkdownPlugins] })
    const markdown = ['before', '', '<!-- private -->', '', 'after'].join('\n')
    const value = loadPlateMarkdown(editor, markdown)

    expect(value).not.toBeInstanceOf(Promise)
    expect(serializePlateMarkdownValue(editor, value as Value).trimEnd()).toBe(markdown)
  })
})

describe('large document worker failures', () => {
  it('does not require a worker to prewarm a small document', async () => {
    await expect(prewarmPlateMarkdown('# Small')).resolves.toBeUndefined()
  })

  it('does not synchronously prewarm a large document when the worker is unavailable', async () => {
    await expect(prewarmPlateMarkdown('line\n'.repeat(2_100))).rejects.toThrow(
      'Markdown worker is unavailable',
    )
  })

  it('does not synchronously parse a large document when the worker is unavailable', async () => {
    const editor = createSlateEditor({ plugins: [...plateMarkdownPlugins] })
    const markdown = 'line\n'.repeat(2_100)

    await expect(loadPlateMarkdown(editor, markdown)).rejects.toThrow(
      'Markdown worker is unavailable',
    )
  })

  it('does not synchronously serialize a large document when the worker is unavailable', async () => {
    const editor = createSlateEditor({ plugins: [...plateMarkdownPlugins] })
    const value: Value = Array.from({ length: 2_100 }, (_, index) => ({
      type: 'p',
      children: [{ text: `line ${index}` }],
    }))

    await expect(serializePlateMarkdown(editor, value)).rejects.toThrow(
      'Markdown worker is unavailable',
    )
  })
})
