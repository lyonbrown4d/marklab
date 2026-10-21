import path from 'node:path'
import { debounce } from 'lodash-es'
import PQueue from 'p-queue'
import type { Plugin } from 'vite'
// eslint-disable-next-line no-restricted-imports -- Build tooling shares the Rust contract exporter.
import { generateDesktopBindings } from './scripts/generate-desktop-bindings.ts'

// Vite already owns the file watcher; Rust edits regenerate the same bindings
// used by builds, with one running job and at most one pending refresh.
export const desktopBindingsPlugin = (): Plugin => {
  let dispose = () => {}
  return {
    name: 'marklab-desktop-bindings',
    apply: 'serve',
    configureServer: (server) => {
      const rustSources = path.join(server.config.root, 'src-tauri/src')
      const manifests = ['Cargo.toml', 'Cargo.lock'].map((name) =>
        path.join(server.config.root, 'src-tauri', name),
      )
      const queue = new PQueue({ concurrency: 1 })
      const shutdown = new AbortController()
      const regenerate = debounce(() => {
        if (shutdown.signal.aborted || queue.size > 0) return
        void queue
          .add(async () => {
            if (shutdown.signal.aborted) return
            await generateDesktopBindings(shutdown.signal)
            if (!shutdown.signal.aborted) server.ws.send({ type: 'full-reload' })
          })
          .catch((error: unknown) => {
            if (shutdown.signal.aborted) return
            const message = error instanceof Error ? error.message : String(error)
            server.config.logger.error(`Desktop bindings generation failed: ${message}`)
            server.ws.send({
              type: 'error',
              err: { message, stack: error instanceof Error ? (error.stack ?? '') : '' },
            })
          })
      }, 250)
      const onChange = (file: string) => {
        const candidate = path.resolve(file)
        if (
          manifests.includes(candidate) ||
          (candidate.startsWith(`${rustSources}${path.sep}`) && candidate.endsWith('.rs'))
        ) {
          regenerate()
        }
      }
      server.watcher.add([rustSources, ...manifests])
      const onWatch = (_event: string, file: string) => onChange(file)
      server.watcher.on('all', onWatch)
      dispose = () => {
        if (shutdown.signal.aborted) return
        regenerate.cancel()
        shutdown.abort()
        server.watcher.off('all', onWatch)
        server.httpServer?.off('close', dispose)
      }
      server.httpServer?.once('close', dispose)
    },
    closeBundle: () => dispose(),
  }
}
