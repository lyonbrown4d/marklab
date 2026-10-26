import { browser } from '@wdio/globals'
import type {} from 'webdriverio'

// ChromeDriver attach cannot load its window-management extension. Exercise
// Tauri's real native geometry commands instead, permitted by E2E config only.
export const getNativeWindowRect = async () => {
  if (process.platform === 'win32') return browser.getWindowRect()
  return browser.execute(async () => {
    const host = window as unknown as {
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: string } }
        invoke: <T>(command: string, payload: { label: string }) => Promise<T>
      }
    }
    const native = host.__TAURI_INTERNALS__
    const payload = native.metadata.currentWindow
    const [position, size, scale] = await Promise.all([
      native.invoke<{ x: number; y: number }>('plugin:window|outer_position', payload),
      native.invoke<{ width: number; height: number }>('plugin:window|inner_size', payload),
      native.invoke<number>('plugin:window|scale_factor', payload),
    ])
    return {
      x: Math.round(position.x / scale),
      y: Math.round(position.y / scale),
      width: Math.round(size.width / scale),
      height: Math.round(size.height / scale),
    }
  })
}

export const setNativeWindowRect = async (x: number, y: number, width: number, height: number) => {
  if (process.platform === 'win32') return browser.setWindowRect(x, y, width, height)
  await browser.execute(
    async (rect) => {
      const host = window as unknown as {
        __TAURI_INTERNALS__: {
          metadata: { currentWindow: { label: string } }
          invoke: (command: string, payload: unknown) => Promise<unknown>
        }
      }
      const native = host.__TAURI_INTERNALS__
      const { label } = native.metadata.currentWindow
      await native.invoke('plugin:window|set_position', {
        label,
        value: { Logical: { x: rect.x, y: rect.y } },
      })
      await native.invoke('plugin:window|set_size', {
        label,
        value: { Logical: { width: rect.width, height: rect.height } },
      })
    },
    { x, y, width, height },
  )
  return getNativeWindowRect()
}
