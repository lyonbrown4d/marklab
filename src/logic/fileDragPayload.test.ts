import { describe, expect, it } from 'vitest'

import {
  MARKLAB_FILE_TREE_ITEM_MIME,
  createFileTreeDragPayload,
  readFileTreeDragPayload,
} from '@/logic/fileDragPayload'

const createDataTransfer = (raw: string) =>
  ({
    getData: (type: string) => (type === MARKLAB_FILE_TREE_ITEM_MIME ? raw : ''),
  }) as DataTransfer

describe('fileDragPayload', () => {
  it('reads valid file tree drag payloads', () => {
    const payload = {
      kind: 'file' as const,
      path: 'docs/readme.md',
      name: 'readme.md',
    }

    expect(readFileTreeDragPayload(createDataTransfer(createFileTreeDragPayload(payload)))).toEqual(
      payload,
    )
  })

  it('rejects invalid file tree drag payloads', () => {
    expect(readFileTreeDragPayload(createDataTransfer('not json'))).toBeNull()
    expect(readFileTreeDragPayload(createDataTransfer('{"kind":"folder"}'))).toBeNull()
    expect(
      readFileTreeDragPayload(
        createDataTransfer(JSON.stringify({ kind: 'file', path: '', name: 'readme.md' })),
      ),
    ).toBeNull()
  })
})
