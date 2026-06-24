import { spawn } from 'node:child_process'

const createPnpmCommand = (args) =>
  process.platform === 'win32'
    ? {
        args: ['/d', '/s', '/c', 'pnpm', ...args],
        command: process.env.ComSpec ?? 'cmd.exe',
      }
    : {
        args,
        command: 'pnpm',
      }

const run = (args, options = {}) =>
  new Promise((resolve, reject) => {
    const command = createPnpmCommand(args)
    const child = spawn(command.command, command.args, {
      env: options.env ?? process.env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`pnpm ${args.join(' ')} exited with ${code}`))
    })
  })

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
