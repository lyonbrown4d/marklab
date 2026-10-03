import type { Value } from 'platejs'
import { describe, expect, it } from 'vitest'
import { processPlateMarkdownWorkerRequest } from '@/workers/plateMarkdownWorker'

describe('processPlateMarkdownWorkerRequest', () => {
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
