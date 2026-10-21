import { build } from 'vite'
import { $ } from 'zx'
// eslint-disable-next-line no-restricted-imports -- Build tooling shares the Rust contract generator.
import { generateDesktopBindings } from './generate-desktop-bindings.ts'

// Tauri can be invoked by a Moon task. Run the same compiler directly so its
// beforeBuild hook does not launch a second nested Moon scheduler.
await generateDesktopBindings()
await $`node node_modules/typescript/bin/tsc6 -b`
await $`pnpm icons:generate`
await build({ mode: 'tauri' })
await build({ configFile: 'vite.splash.config.ts', mode: 'tauri' })
