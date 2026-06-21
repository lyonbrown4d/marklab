import { describe, expect, it } from 'vitest'

import {
  EMPTY_EXCALIDRAW_DOCUMENT,
  parseExcalidrawDocument,
} from '@/components/previews/excalidrawDocument'

describe('parseExcalidrawDocument', () => {
  it('creates an empty scene for empty files', () => {
    expect(parseExcalidrawDocument('')).toEqual({
      content: JSON.stringify(EMPTY_EXCALIDRAW_DOCUMENT, null, 2),
      initialData: EMPTY_EXCALIDRAW_DOCUMENT,
    })
  })

  it('normalizes missing optional scene fields', () => {
    expect(parseExcalidrawDocument('{"type":"excalidraw","version":2}').initialData).toEqual({
      type: 'excalidraw',
      version: 2,
      source: 'marklab',
      elements: [],
      appState: {},
      files: {},
    })
  })

  it('rejects invalid scene payloads', () => {
    expect(() => parseExcalidrawDocument('[]')).toThrow('Invalid Excalidraw document')
  })
})
