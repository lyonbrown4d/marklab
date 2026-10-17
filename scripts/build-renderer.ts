import { build } from 'vite'
import { $ } from 'zx'

// Tauri can be invoked by a Moon task. Run the same compiler directly so its
// beforeBuild hook does not launch a second nested Moon scheduler.
await $`node node_modules/typescript/bin/tsc6 -b`
await $`pnpm icons:generate`
await build({ mode: 'tauri' })
await build({ configFile: 'vite.splash.config.ts', mode: 'tauri' })
