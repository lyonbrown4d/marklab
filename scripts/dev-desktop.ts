import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { $ } from 'zx'
import type { ProcessPromise } from 'zx'
import { z } from 'zod'
// eslint-disable-next-line no-restricted-imports -- Workflow scripts share their typed configuration directly.
import { createDevelopmentCsp, loadDevelopmentConfig } from './development-config.ts'
// eslint-disable-next-line no-restricted-imports -- Prepare Rust contracts before Tauri starts its frontend readiness timer.
import { generateDesktopBindings } from './generate-desktop-bindings.ts'

const { configuration, environment } = loadDevelopmentConfig()
const run = $({ stdio: 'inherit', nothrow: true, env: environment })
const children: ProcessPromise[] = []
const shutdown = new AbortController()
let signalExitCode: number | undefined
let cleanup: Promise<void> | undefined
const hasFinished = (child: ProcessPromise) =>
  child.stage === 'fulfilled' || child.stage === 'rejected'

const stopChildren = () => {
  cleanup ??= Promise.allSettled(
    children.map(async (child) => {
      if (hasFinished(child) || !child.pid) return
      await child.kill('SIGTERM')
      await child.timeout('2s', 'SIGKILL')
    }),
  ).then((results) => {
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Development process cleanup failed:', result.reason)
        process.exitCode = signalExitCode ?? 1
      }
    }
  })
  return cleanup
}

const handleSignal = (signal: 'SIGINT' | 'SIGTERM') => {
  signalExitCode = signal === 'SIGINT' ? 130 : 143
  shutdown.abort(new Error(`Development interrupted by ${signal}`))
  void stopChildren()
}
const handleInterrupt = () => handleSignal('SIGINT')
const handleTerminate = () => handleSignal('SIGTERM')
process.once('SIGINT', handleInterrupt)
process.once('SIGTERM', handleTerminate)

const backendReady = async () => {
  try {
    const response = await fetch(configuration.origin, {
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(750)]),
    })
    return response.ok && (await response.text()).includes('ReactDevToolsBackend')
  } catch {
    return false
  }
}

const waitForBackend = async () => {
  // The official CLI exposes readiness through HTTP; polling is bounded and abortable.
  const deadline = Date.now() + configuration.readinessTimeoutMs
  while (Date.now() < deadline) {
    shutdown.signal.throwIfAborted()
    if (await backendReady()) return
    await delay(150, undefined, { signal: shutdown.signal })
  }
  throw new Error(
    `React DevTools did not become ready at ${configuration.origin}. Set MARKLAB_REACT_DEVTOOLS=false to opt out.`,
  )
}

try {
  // A cold Rust build can exceed Tauri's frontend readiness timeout.
  await generateDesktopBindings(shutdown.signal)
  shutdown.signal.throwIfAborted()
  let tools: ProcessPromise | undefined
  let configArguments: string[] = []
  if (configuration.enabled) {
    const config = z
      .object({ app: z.object({ security: z.object({ csp: z.string() }) }) })
      .parse(JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8')))
    configArguments = [
      '--config',
      JSON.stringify({
        app: {
          security: {
            devCsp: createDevelopmentCsp(config.app.security.csp, configuration),
          },
        },
      }),
    ]
    if (!(await backendReady())) {
      const toolEnvironment: NodeJS.ProcessEnv = {
        ...environment,
        HOST: configuration.host,
        REACT_DEVTOOLS_PORT: String(configuration.port),
        REACT_DEVTOOLS_CLIENT_HOST: configuration.host,
        REACT_DEVTOOLS_CLIENT_PORT: String(configuration.port),
        // pnpm owns tool updates; skip the CLI's legacy background update checker.
        NO_UPDATE_NOTIFIER: '1',
        KEY: '',
        CERT: '',
      }
      delete toolEnvironment.ELECTRON_RUN_AS_NODE
      shutdown.signal.throwIfAborted()
      tools = $({ stdio: 'inherit', nothrow: true, env: toolEnvironment })`pnpm exec react-devtools`
      children.push(tools)
      await Promise.race([
        waitForBackend(),
        tools.then((result) => {
          throw new Error(`React DevTools exited before readiness (code ${result.exitCode}).`)
        }),
      ])
    }
    console.info(`React DevTools ready at ${configuration.origin}`)
  }
  shutdown.signal.throwIfAborted()
  const desktop = run`pnpm exec tauri dev ${configArguments} ${process.argv.slice(2)}`
  children.push(desktop)
  const result = await Promise.race(tools ? [desktop, tools] : [desktop])
  process.exitCode = signalExitCode ?? result.exitCode ?? 1
} catch (error) {
  if (!signalExitCode) console.error(error instanceof Error ? error.message : error)
  process.exitCode = signalExitCode ?? 1
} finally {
  shutdown.abort()
  await stopChildren()
  process.removeListener('SIGINT', handleInterrupt)
  process.removeListener('SIGTERM', handleTerminate)
}
