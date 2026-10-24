import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { z } from 'zod'
import { browser } from '@wdio/globals'

const execute = promisify(execFile)
const repository = fileURLToPath(new URL('../../', import.meta.url))
const bounds = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
const measurements = z.array(
  z.object({ window: bounds, close: bounds, minimize: bounds, zoom: bounds }),
)

export const assertWindowButtonsAligned = async (workspace: string) => {
  if (process.platform !== 'darwin') return
  const { stdout: processes } = await execute('/bin/ps', ['-eo', 'pid=,args='])
  const command = `${repository}src-tauri/target/debug/marklab-desktop --workspace ${workspace}`
  const owned = processes
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .find((match) => match?.[2] === command)
  assert.ok(owned, 'The owned E2E process is missing')
  const { stdout } = await execute(
    '/usr/bin/swift',
    [fileURLToPath(new URL('./windowButtons.swift', import.meta.url)), owned[1]!],
    {
      env: {
        ...process.env,
        SWIFT_MODULECACHE_PATH: `${repository}src-tauri/target/swift-module-cache`,
        CLANG_MODULE_CACHE_PATH: `${repository}src-tauri/target/clang-module-cache`,
      },
      timeout: 60_000,
    },
  )
  const windows = measurements.parse(JSON.parse(stdout))
  const current = await browser.getWindowRect()
  const nativeWindow = windows.find(
    ({ window }) => Math.abs(window.x - current.x) <= 1 && Math.abs(window.y - current.y) <= 1,
  )
  assert.ok(nativeWindow, 'No native window buttons matched the active E2E window')
  const chromeCenter = await browser.execute(() => {
    const control = document.querySelector('[data-app-focus-zone="titlebar"] button')
    if (!control) throw new Error('Titlebar control is missing')
    const rect = control.getBoundingClientRect()
    return rect.top + rect.height / 2
  })
  for (const name of ['close', 'minimize', 'zoom'] as const) {
    const button: z.infer<typeof bounds> = nativeWindow[name]
    const center: number = button.y - nativeWindow.window.y + button.height / 2
    assert.ok(
      Math.abs(center - chromeCenter) <= 1,
      `${name} native center ${center} differs from titlebar ${chromeCenter}`,
    )
  }
}
