import { act, renderHook } from '@testing-library/react'
import { createRef, StrictMode, type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlateEditor } from 'platejs/react'
import {
  placePlateSelectionAtClientPoint,
  usePlateAssetDrop,
} from '@/components/plate/usePlateAssetDrop'
import { onRuntimeWebviewFileDrop } from '@/runtime/webview'

vi.mock('@/runtime/webview', () => ({ onRuntimeWebviewFileDrop: vi.fn() }))

describe('usePlateAssetDrop', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps client coordinates to the native Plate event range', () => {
    const editor = createPlateEditor({ value: [{ type: 'p', children: [{ text: 'Hello' }] }] })
    const root = document.createElement('div')
    const target = document.createElement('span')
    root.append(target)
    const range = {
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    }
    const findEventRange = vi.fn(() => range)
    editor.api.findEventRange = findEventRange
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => target,
    })

    expect(placePlateSelectionAtClientPoint(editor, root, 20, 30)).toBe(true)
    expect(findEventRange).toHaveBeenCalledWith({ clientX: 20, clientY: 30, target })
    expect(editor.selection).toEqual(range)
  })

  it('inserts imported images at the captured Plate selection', async () => {
    const editor = createPlateEditor({ value: [{ type: 'p', children: [{ text: 'Hello' }] }] })
    editor.tf.select({ path: [0, 0], offset: 5 })
    const shellRef = createRef<HTMLDivElement>()
    const importSources = vi.fn(async (_sources, insertImage) => {
      editor.tf.select({ path: [0, 0], offset: 0 })
      return insertImage('./Page.assets/photo.png', 'photo')
    })
    const { result } = renderHook(() => usePlateAssetDrop({ editor, importSources, shellRef }))

    await act(async () => {
      await result.current.importImageSources([
        { kind: 'path', path: 'C:\\tmp\\photo.png', name: 'photo.png' },
      ])
    })

    expect(editor.children).toContainEqual({
      type: 'img',
      url: './Page.assets/photo.png',
      alt: 'photo',
      children: [{ text: '' }],
    })
  })

  it('remains active after React Strict Mode replays its mount effect', async () => {
    const editor = createPlateEditor({ value: [{ type: 'p', children: [{ text: '' }] }] })
    editor.tf.select({ path: [0, 0], offset: 0 })
    const importSources = vi.fn(async () => true)
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>
    const { result } = renderHook(
      () => usePlateAssetDrop({ editor, importSources, shellRef: createRef() }),
      { wrapper },
    )

    await act(async () => {
      await result.current.importImageSources([
        { kind: 'path', path: 'C:\\tmp\\photo.png', name: 'photo.png' },
      ])
    })

    expect(importSources).toHaveBeenCalledOnce()
  })

  it('settles a failed importer without leaving the loading state active', async () => {
    const editor = createPlateEditor({ value: [{ type: 'p', children: [{ text: '' }] }] })
    editor.tf.select({ path: [0, 0], offset: 0 })
    const importSources = vi.fn(async () => {
      throw new Error('disk unavailable')
    })
    const onImportError = vi.fn()
    const { result } = renderHook(() =>
      usePlateAssetDrop({
        editor,
        importSources,
        onImportError,
        shellRef: createRef(),
      }),
    )

    await act(async () => {
      await expect(
        result.current.importImageSources([
          { kind: 'path', path: 'C:\\tmp\\photo.png', name: 'photo.png' },
        ]),
      ).resolves.toBe(false)
    })

    expect(onImportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'disk unavailable' }),
    )
    expect(result.current.importingImages).toBe(false)
  })

  it('ignores a native runtime drop after the hook unmounts', async () => {
    type RuntimeHandler = (event: { paths: string[]; position: { x: number; y: number } }) => void
    let runtimeHandler: RuntimeHandler | undefined
    vi.mocked(onRuntimeWebviewFileDrop).mockImplementation(async (handler) => {
      runtimeHandler = handler
      return () => undefined
    })
    const editor = createPlateEditor({ value: [{ type: 'p', children: [{ text: '' }] }] })
    const shell = document.createElement('div')
    shell.getBoundingClientRect = () => ({
      bottom: 200,
      height: 200,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const shellRef = { current: shell }
    const importSources = vi.fn(async () => true)
    const { unmount } = renderHook(() => usePlateAssetDrop({ editor, importSources, shellRef }))
    await act(async () => Promise.resolve())
    unmount()

    const dispatchRuntimeDrop = runtimeHandler as RuntimeHandler | undefined
    dispatchRuntimeDrop?.({ paths: ['C:\\tmp\\photo.png'], position: { x: 50, y: 50 } })
    await act(async () => Promise.resolve())

    expect(importSources).not.toHaveBeenCalled()
  })
})
