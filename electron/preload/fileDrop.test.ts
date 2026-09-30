import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getPathForFile } = vi.hoisted(() => ({
  getPathForFile: vi.fn<(file: File) => string>(),
}))

vi.mock('electron', () => ({
  webUtils: { getPathForFile },
}))

import { onFileDrop } from '@electron/preload/fileDrop.js'

const fileList = (...files: File[]) => files as unknown as FileList

const dispatchDrop = (files: File[], types: string[] = ['Files']) => {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    clientX: { value: 12 },
    clientY: { value: 8 },
    dataTransfer: {
      value: { files: fileList(...files), types },
    },
  })
  window.dispatchEvent(event)
  return event
}

describe('preload file drop bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves paths with webUtils and prioritizes Markdown files in a mixed drop', () => {
    const markdown = new File(['# note'], 'note.md', { type: 'text/markdown' })
    const image = new File(['image'], 'cover.png', { type: 'image/png' })
    getPathForFile.mockImplementation((file) =>
      file === markdown ? 'C:\\notes\\note.md' : 'C:\\notes\\cover.png',
    )
    const handler = vi.fn()
    const unsubscribe = onFileDrop(handler)

    const event = dispatchDrop([image, markdown])

    expect(event.defaultPrevented).toBe(true)
    expect(handler).toHaveBeenCalledWith({
      paths: ['C:\\notes\\note.md'],
      position: { x: 24, y: 16 },
    })
    unsubscribe()
  })

  it('keeps image-only drops available to the Markdown editor', () => {
    const image = new File(['image'], 'cover.png', { type: 'image/png' })
    getPathForFile.mockReturnValue('C:\\notes\\cover.png')
    const handler = vi.fn()
    const unsubscribe = onFileDrop(handler)

    dispatchDrop([image])

    expect(handler).toHaveBeenCalledWith({
      paths: ['C:\\notes\\cover.png'],
      position: { x: 24, y: 16 },
    })
    unsubscribe()
  })

  it('does not trust a legacy File.path when webUtils cannot resolve it', () => {
    const file = new File(['# note'], 'note.md') as File & { path: string }
    file.path = 'C:\\untrusted\\note.md'
    getPathForFile.mockReturnValue('')
    const handler = vi.fn()
    const unsubscribe = onFileDrop(handler)

    dispatchDrop([file])

    expect(handler).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('leaves non-file drops untouched', () => {
    const handler = vi.fn()
    const unsubscribe = onFileDrop(handler)

    const event = dispatchDrop([], ['text/plain'])

    expect(event.defaultPrevented).toBe(false)
    expect(handler).not.toHaveBeenCalled()
    unsubscribe()
  })
})
