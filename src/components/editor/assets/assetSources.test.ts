import { describe, expect, it } from 'vitest'
import {
  imageSourcesFromDropEvent,
  imageSourcesFromClipboardData,
  imageSourcesFromFiles,
  imageSourcesFromRuntimeDropPaths,
  normalizeImageSourceUrl,
} from '@/components/editor/assets/assetSources'
import { createFileTreeDragPayload, MARKLAB_FILE_TREE_ITEM_MIME } from '@/logic/fileDragPayload'

describe('image asset source parsing', () => {
  it('keeps supported browser image files and drops disguised documents', () => {
    const image = new File(['png'], 'cover.png', { type: 'image/png' })
    const document = new File(['text'], 'notes.md', { type: 'text/markdown' })
    const disguisedExecutable = new File(['binary'], 'payload.exe', { type: 'image/png' })

    expect(imageSourcesFromFiles([image, document, disguisedExecutable])).toEqual([
      { kind: 'file', file: image },
    ])
  })

  it('normalizes only safe remote image URLs', () => {
    expect(normalizeImageSourceUrl(' https://cdn.example.com/cover.webp?rev=2 ')).toBe(
      'https://cdn.example.com/cover.webp?rev=2',
    )
    expect(normalizeImageSourceUrl('javascript:alert(1).png')).toBeNull()
    expect(normalizeImageSourceUrl('data:image/svg+xml,<svg/>')).toBeNull()
    expect(normalizeImageSourceUrl('https://user:secret@example.com/private.png')).toBeNull()
    expect(normalizeImageSourceUrl('https://example.com/not-an-image')).toBeNull()
  })

  it('accepts cross-platform runtime paths but rejects non-images and URI-like paths', () => {
    expect(
      imageSourcesFromRuntimeDropPaths([
        'C:\\docs\\diagram.PNG',
        '/home/alice/picture.avif',
        '\\\\server\\share\\photo.jpg',
        'file:///C:/docs/unsafe.png',
        'C:\\docs\\notes.md',
      ]),
    ).toEqual([
      { kind: 'path', name: 'diagram.PNG', path: 'C:\\docs\\diagram.PNG' },
      { kind: 'path', name: 'picture.avif', path: '/home/alice/picture.avif' },
      { kind: 'path', name: 'photo.jpg', path: '\\\\server\\share\\photo.jpg' },
    ])
  })

  it('reads an image file before text and never treats arbitrary text as a path', () => {
    const file = new File(['png'], 'pasted.png', { type: 'image/png' })
    const clipboard = {
      files: [file],
      getData: (type: string) => (type === 'text/plain' ? 'C:\\secrets\\photo.png' : ''),
    }

    expect(imageSourcesFromClipboardData(clipboard)).toEqual([{ kind: 'file', file }])
  })

  it('keeps a traversal-free workspace image from the file-tree drag payload', () => {
    const payload = createFileTreeDragPayload({
      kind: 'file',
      name: 'diagram.png',
      path: 'docs/assets/diagram.png',
    })
    const dataTransfer = {
      files: [] as unknown as FileList,
      getData: (type: string) => (type === MARKLAB_FILE_TREE_ITEM_MIME ? payload : ''),
    } as DataTransfer

    expect(imageSourcesFromDropEvent({ dataTransfer } as never)).toEqual([
      { kind: 'path', name: 'diagram.png', path: 'docs/assets/diagram.png' },
    ])
  })
})
