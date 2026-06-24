import { execa } from 'execa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

type RunOptions = {
  env?: NodeJS.ProcessEnv
}

const run = (args: string[], options: RunOptions = {}): Promise<void> =>
  execa('pnpm', args, {
    cwd: repoRoot,
    env: options.env,
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
  }).then(() => undefined)

await run(['knowledge:proto:gen'])
await run(['knowledge:build'])
await run(
  [
    'exec',
    'vitest',
    'run',
    'electron/services/knowledgeEngine/workspaceSidecar.integration.test.ts',
  ],
  {
    env: {
      ...process.env,
      MARKLAB_RUN_KNOWLEDGE_INTEGRATION: '1',
    },
  },
)
