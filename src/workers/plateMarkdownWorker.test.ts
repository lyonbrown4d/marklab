import type { Value } from 'platejs'
import { describe, expect, it } from 'vitest'
import {
  chunkPlateMarkdownValue,
  processPlateMarkdownWorkerRequest,
} from '@/workers/plateMarkdownWorker'

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
})
