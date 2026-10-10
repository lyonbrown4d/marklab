import { build } from 'vite'

await build({ mode: 'electron' })
await build({ configFile: 'vite.splash.config.ts', mode: 'electron' })
