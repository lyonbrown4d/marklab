import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { $ } from 'zx'

const repository = fileURLToPath(new URL('../../', import.meta.url))
export const usesCef = process.platform !== 'win32'

export const applicationBinary = () => {
  const variant =
    process.env.MARKLAB_E2E_CANVAS_BASELINE === '1'
      ? '-uninstrumented'
      : process.env.MARKLAB_E2E_BASELINE === '1'
        ? '-baseline'
        : process.env.MARKLAB_E2E_REACT_PROFILE === '1'
          ? '-react-profiler'
          : ''
  return path.join(
    repository,
    'src-tauri/target/debug',
    process.platform === 'darwin'
      ? `bundle/macos/Marklab E2E${variant}.app/Contents/MacOS/marklab-desktop`
      : `marklab-desktop${variant}${process.platform === 'win32' ? '.exe' : ''}`,
  )
}

// CEF exposes its normal Chromium automation protocol only in the debug E2E
// feature. WDIO attaches ChromeDriver after readiness; this scope owns the app.
export const withNativeApplication = async (
  workspace: string,
  run: () => Promise<number>,
): Promise<number> => {
  if (!usesCef) return run()
  const port = Number(process.env.MARKLAB_E2E_DRIVER_PORT)
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Native E2E requires its allocated loopback debugging port')
  const shutdown = new AbortController()
  const child = $({
    stdio: 'inherit',
    nothrow: true,
  })`${applicationBinary()} --workspace ${workspace}`
  const stop = () => shutdown.abort(new Error('Native E2E interrupted'))
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    const ready = async () => {
      const deadline = Date.now() + 90_000
      while (Date.now() < deadline) {
        shutdown.signal.throwIfAborted()
        try {
          const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
            signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(750)]),
          })
          const version: unknown = await response.json()
          if (
            response.ok &&
            typeof version === 'object' &&
            version !== null &&
            'Browser' in version
          ) {
            const match = String(version.Browser).match(/(?:Chrome|Chromium)\/(\d+\.\d+\.\d+\.\d+)/)
            if (!match) throw new Error('CEF returned an unsupported Chromium version')
            process.env.MARKLAB_E2E_CHROMIUM_VERSION = match[1]
            return
          }
        } catch (error) {
          if (shutdown.signal.aborted) throw error
        }
        await delay(150, undefined, { signal: shutdown.signal })
      }
      throw new Error(`CEF automation did not become ready on loopback port ${port}`)
    }
    await Promise.race([
      ready(),
      child.then((result) => {
        throw new Error(`The native E2E app exited before readiness (code ${result.exitCode})`)
      }),
    ])
    // WDIO owns runner/driver cancellation and settles after its teardown.
    return await run()
  } finally {
    shutdown.abort()
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    if (child.stage !== 'fulfilled' && child.stage !== 'rejected') {
      await child.kill('SIGTERM')
      await child.timeout('3s', 'SIGKILL')
    }
  }
}
