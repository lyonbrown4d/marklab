import type { IpcMain } from 'electron'
import { Blob, Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels.js'
import { registerClipboardIpc } from '@electron/ipc/clipboard.js'

const image = vi.hoisted(() => ({
  createFromBuffer: vi.fn(),
  isEmpty: vi.fn(),
  getSize: vi.fn(),
  toDataURL: vi.fn(),
}))
vi.mock('electron', () => ({ nativeImage: { createFromBuffer: image.createFromBuffer } }))

const handle = vi.fn<IpcMain['handle']>()
const clipboard = { read: vi.fn(), readText: vi.fn(), writeText: vi.fn() }
const invoke = (channel: string, ...args: unknown[]): unknown => {
  const registration = handle.mock.calls.find(([name]) => name === channel)
  if (!registration) throw new Error(`Missing handler: ${channel}`)
  return Reflect.apply(registration[1], undefined, [undefined, ...args])
}

beforeEach(() => {
  vi.resetAllMocks()
  clipboard.read.mockResolvedValue([])
  image.isEmpty.mockReturnValue(false)
  image.getSize.mockReturnValue({ width: 2, height: 3 })
  image.toDataURL.mockReturnValue('data:image/png;base64,AQID')
  image.createFromBuffer.mockReturnValue(image)
  registerClipboardIpc({ handle }, clipboard)
})

describe('Electron 44 clipboard IPC', () => {
  it('returns no image when clipboard items contain no supported image', async () => {
    await expect(invoke(nativeIpcChannels.clipboardReadImage)).resolves.toBeNull()
    expect(image.createFromBuffer).not.toHaveBeenCalled()
  })
  it('prefers PNG and converts its Blob bytes through nativeImage', async () => {
    const getJpeg = vi.fn()
    const getPng = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    clipboard.read.mockResolvedValueOnce([
      { types: ['image/jpeg'], getType: getJpeg },
      { types: ['image/png'], getType: getPng },
    ])
    await expect(invoke(nativeIpcChannels.clipboardReadImage)).resolves.toEqual({
      dataUrl: 'data:image/png;base64,AQID',
      width: 2,
      height: 3,
    })
    expect(getPng).toHaveBeenCalledWith('image/png')
    expect(getJpeg).not.toHaveBeenCalled()
    expect(image.createFromBuffer).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
  })
  it('supports JPEG and rejects an empty decoded image', async () => {
    const getType = vi.fn().mockResolvedValue(new Blob([], { type: 'image/jpeg' }))
    clipboard.read.mockResolvedValueOnce([{ types: ['image/jpeg'], getType }])
    image.isEmpty.mockReturnValueOnce(true)
    await expect(invoke(nativeIpcChannels.clipboardReadImage)).resolves.toBeNull()
    expect(getType).toHaveBeenCalledWith('image/jpeg')
  })
  it('waits for text writes before acknowledging and propagates write failures', async () => {
    let release = () => {}
    clipboard.writeText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    let settled = false
    const pending = Promise.resolve(invoke(nativeIpcChannels.clipboardWriteText, 'hello')).then(
      (value) => {
        settled = true
        return value
      },
    )
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await expect(pending).resolves.toEqual({ ok: true })
    clipboard.writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
    await expect(invoke(nativeIpcChannels.clipboardWriteText, 'text')).rejects.toThrow(
      'Clipboard unavailable',
    )
  })
  it('forwards asynchronous text reads and sanitizes non-string writes', async () => {
    clipboard.readText.mockResolvedValueOnce('text')
    await expect(invoke(nativeIpcChannels.clipboardReadText)).resolves.toBe('text')
    await expect(invoke(nativeIpcChannels.clipboardWriteText, null)).resolves.toEqual({ ok: true })
    expect(clipboard.writeText).toHaveBeenCalledWith('')
  })

  it('ignores non-image clipboard items without reading their data', async () => {
    const getType = vi.fn()
    clipboard.read.mockResolvedValueOnce([{ types: ['text/plain'], getType }])
    await expect(invoke(nativeIpcChannels.clipboardReadImage)).resolves.toBeNull()
    expect(getType).not.toHaveBeenCalled()
    expect(image.createFromBuffer).not.toHaveBeenCalled()
  })

  it.each([
    { title: 'Bookmark', url: 'https://example.test' },
    null,
    'invalid clipboard data',
    { arrayBuffer: 'not callable' },
  ])('rejects a non-Blob image payload: %j', async (payload) => {
    clipboard.read.mockResolvedValueOnce([
      {
        types: ['image/png'],
        getType: vi.fn().mockResolvedValue(payload),
      },
    ])
    await expect(invoke(nativeIpcChannels.clipboardReadImage)).resolves.toBeNull()
    expect(image.createFromBuffer).not.toHaveBeenCalled()
  })

  it('propagates clipboard and image data read failures through IPC', async () => {
    clipboard.read.mockRejectedValueOnce(new Error('Clipboard read failed'))
    await expect(invoke(nativeIpcChannels.clipboardReadImage)).rejects.toThrow(
      'Clipboard read failed',
    )
    clipboard.read.mockResolvedValueOnce([
      {
        types: ['image/png'],
        getType: vi.fn().mockRejectedValue(new Error('Image data unavailable')),
      },
    ])
    await expect(invoke(nativeIpcChannels.clipboardReadImage)).rejects.toThrow(
      'Image data unavailable',
    )
    expect(image.createFromBuffer).not.toHaveBeenCalled()
  })
})
