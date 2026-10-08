import type { Value } from 'platejs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chunkPlateMarkdownValue,
  processPlateMarkdownWorkerRequest,
} from '@/workers/plateMarkdownWorker'
import type {
  PlateMarkdownWorkerRequest,
  PlateMarkdownWorkerResponse,
} from '@/workers/plateMarkdownWorkerProtocol'

afterEach(() => vi.restoreAllMocks())

describe('processPlateMarkdownWorkerRequest', () => {
  it('splits parsed values into bounded top-level chunks without changing node order', () => {
    const value: Value = Array.from({ length: 7 }, (_, index) => ({
      type: 'p',
      children: [{ text: String(index) }],
    }))

    const chunks = chunkPlateMarkdownValue(value, 3)

    expect(chunks.map((chunk) => chunk.length)).toEqual([3, 3, 1])
    expect(chunks.flat()).toEqual(value)
  })

  it('adapts chunks to both clone size and top-level node count', () => {
    const textHeavy: Value = Array.from({ length: 3 }, (_, index) => ({
      type: 'p',
      children: [{ text: `${index}`.repeat(4) }],
    }))
    const nodeHeavy: Value = Array.from({ length: 1_200 }, (_, index) => ({
      type: 'p',
      children: [{ text: String(index) }],
    }))

    expect(chunkPlateMarkdownValue(textHeavy, 10, 6).map((chunk) => chunk.length)).toEqual([
      1, 1, 1,
    ])
    expect(chunkPlateMarkdownValue(nodeHeavy).map((chunk) => chunk.length)).toEqual([
      20, 240, 240, 240, 240, 220,
    ])
  })

  it('uses lossless serialization for document characters', () => {
    const value: Value = [{ type: 'p', children: [{ text: 'before\u200bafter' }] }]

    expect(processPlateMarkdownWorkerRequest({ id: 1, operation: 'serialize', value })).toEqual({
      id: 1,
      markdown: 'before\u200bafter\n',
      ok: true,
      operation: 'serialize',
    })
  })

  it('keeps callout markers distinct from escaped marker literals', () => {
    const callout = processPlateMarkdownWorkerRequest({
      id: 1,
      markdown: '> [!NOTE]\n> Body',
      operation: 'parse',
    })
    const literal = processPlateMarkdownWorkerRequest({
      id: 2,
      markdown: '> \\[!NOTE]\n> Body',
      operation: 'parse',
    })
    if (!callout.ok || callout.operation !== 'parse') throw new Error('Callout parse failed.')
    if (!literal.ok || literal.operation !== 'parse') throw new Error('Literal parse failed.')

    const serializedCallout = processPlateMarkdownWorkerRequest({
      id: 3,
      operation: 'serialize',
      value: callout.value,
    })
    const serializedLiteral = processPlateMarkdownWorkerRequest({
      id: 4,
      operation: 'serialize',
      value: literal.value,
    })

    expect(serializedCallout).toMatchObject({ markdown: expect.stringContaining('> [!NOTE]') })
    expect(serializedLiteral).toMatchObject({ markdown: expect.stringContaining('> \\[!NOTE]') })
  })

  it('keeps HTML comments intact through the worker parser', () => {
    const markdown = ['before', '', '<!-- private -->', '', 'after'].join('\n')
    const parsed = processPlateMarkdownWorkerRequest({
      id: 1,
      markdown,
      operation: 'parse',
    })
    if (!parsed.ok || parsed.operation !== 'parse') throw new Error('HTML comment parse failed.')

    const serialized = processPlateMarkdownWorkerRequest({
      id: 2,
      operation: 'serialize',
      value: parsed.value,
    })

    expect(serialized).toMatchObject({ markdown: `${markdown}\n` })
  })

  it('consumes prepared stream chunks before a later stream of the same Markdown', () => {
    const postMessage = vi.spyOn(self, 'postMessage').mockImplementation(() => undefined)
    const send = (data: PlateMarkdownWorkerRequest) => {
      self.onmessage?.({ data } as MessageEvent<PlateMarkdownWorkerRequest>)
    }

    send({ id: 100, markdown: '# Prepared', operation: 'prepare-stream' })
    send({ id: 101, markdown: '# Prepared', operation: 'parse-stream' })
    send({ id: 102, markdown: '# Prepared', operation: 'parse-stream' })

    const first = postMessage.mock.calls[1]?.[0] as PlateMarkdownWorkerResponse
    const second = postMessage.mock.calls[2]?.[0] as PlateMarkdownWorkerResponse
    if (!first.ok || first.operation !== 'parse-stream') throw new Error('First stream failed.')
    if (!second.ok || second.operation !== 'parse-stream') throw new Error('Second stream failed.')
    expect(second.value).not.toBe(first.value)

    postMessage.mockRestore()
  })

  it('keeps another stream intact when delivering a later chunk fails', () => {
    const firstMarkdown = Array.from({ length: 21 }, (_, index) => `# First heading ${index}`).join(
      '\n',
    )
    const secondMarkdown = Array.from(
      { length: 21 },
      (_, index) => `# Second heading ${index}`,
    ).join('\n')
    let rejectNextFirstChunk = false
    const postMessage = vi.spyOn(self, 'postMessage').mockImplementation((message) => {
      const response = message as PlateMarkdownWorkerResponse
      if (
        rejectNextFirstChunk &&
        response.id === 201 &&
        response.ok &&
        response.operation === 'parse-stream'
      ) {
        rejectNextFirstChunk = false
        throw new Error('Transfer failed')
      }
    })
    const send = (data: PlateMarkdownWorkerRequest) => {
      self.onmessage?.({ data } as MessageEvent<PlateMarkdownWorkerRequest>)
    }

    send({ id: 201, markdown: firstMarkdown, operation: 'parse-stream' })
    send({ id: 202, markdown: secondMarkdown, operation: 'parse-stream' })
    rejectNextFirstChunk = true

    send({ id: 201, operation: 'parse-next' })
    expect(postMessage.mock.calls[3]?.[0]).toMatchObject({
      error: 'Transfer failed',
      id: 201,
      ok: false,
      operation: 'parse-stream',
    })
    send({ id: 202, operation: 'parse-next' })
    const callsAfterSecondCompletes = postMessage.mock.calls.length
    send({ id: 201, operation: 'parse-next' })

    expect(postMessage.mock.calls[4]?.[0]).toMatchObject({
      done: true,
      id: 202,
      ok: true,
      operation: 'parse-stream',
      value: [{ children: [{ text: 'Second heading 20' }], type: 'h1' }],
    })
    expect(postMessage).toHaveBeenCalledTimes(callsAfterSecondCompletes)

    postMessage.mockRestore()
  })

  it('keeps another stream intact when the first stream is cancelled', () => {
    const firstMarkdown = Array.from({ length: 21 }, (_, index) => `# First heading ${index}`).join(
      '\n',
    )
    const secondMarkdown = Array.from(
      { length: 21 },
      (_, index) => `# Second heading ${index}`,
    ).join('\n')
    const postMessage = vi.spyOn(self, 'postMessage').mockImplementation(() => undefined)
    const send = (data: PlateMarkdownWorkerRequest) => {
      self.onmessage?.({ data } as MessageEvent<PlateMarkdownWorkerRequest>)
    }

    send({ id: 301, markdown: firstMarkdown, operation: 'parse-stream' })
    send({ id: 302, markdown: secondMarkdown, operation: 'parse-stream' })
    send({ id: 301, operation: 'cancel' })
    send({ id: 302, operation: 'parse-next' })
    const callsAfterSecondCompletes = postMessage.mock.calls.length
    send({ id: 301, operation: 'parse-next' })

    expect(postMessage.mock.calls[2]?.[0]).toMatchObject({
      done: true,
      id: 302,
      ok: true,
      operation: 'parse-stream',
      value: [{ children: [{ text: 'Second heading 20' }], type: 'h1' }],
    })
    expect(postMessage).toHaveBeenCalledTimes(callsAfterSecondCompletes)

    postMessage.mockRestore()
  })
})
