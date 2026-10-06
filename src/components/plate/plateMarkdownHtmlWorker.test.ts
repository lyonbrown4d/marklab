import { describe, expect, it } from 'vitest'
import { processPlateMarkdownWorkerRequest } from '@/workers/plateMarkdownWorker'

describe('Plate Markdown HTML worker compatibility', () => {
  it('parses semantic HTML without DOMParser and serializes it losslessly', () => {
    const markdown = [
      '<details>',
      '<summary>Worker details</summary>',
      '',
      'Press <kbd>Ctrl</kbd><br>to continue.',
      '',
      '</details>',
    ].join('\n')
    const parsed = processPlateMarkdownWorkerRequest({
      id: 1,
      markdown,
      operation: 'parse',
    })
    if (!parsed.ok || parsed.operation !== 'parse') throw new Error('Worker HTML parse failed.')

    expect(parsed.value[0]).toMatchObject({ type: 'htmlDetails' })
    expect(
      processPlateMarkdownWorkerRequest({ id: 2, operation: 'serialize', value: parsed.value }),
    ).toMatchObject({ markdown: `${markdown}\n`, ok: true })
  })
})
