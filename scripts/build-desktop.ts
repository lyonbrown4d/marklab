import { $ } from 'zx'
// eslint-disable-next-line no-restricted-imports -- Shared native workflow configuration.
import { nativeEnvironment } from './native-environment.ts'

// CEF requires its framework and helpers inside a macOS application bundle.
const action = process.argv[2] ?? 'build'
if (!['build', 'bundle', 'e2e', 'check', 'test'].includes(action))
  throw new Error('Expected build, bundle, e2e, check, or test')
const run = $({ stdio: 'inherit', env: nativeEnvironment() })
if (action === 'check' || action === 'test') {
  await run`pnpm icons:generate`
  await run`cargo ${action} --manifest-path src-tauri/Cargo.toml ${process.argv.slice(3)}`
} else {
  const macOS = process.platform === 'darwin'
  const args =
    action === 'bundle'
      ? ['bundle']
      : [
          'build',
          ...(macOS ? ['--bundles', 'app'] : ['--no-bundle']),
          ...(action === 'e2e'
            ? ['--debug', '--features', 'e2e-testing', '--config', 'e2e/tauri/tauri.e2e.conf.json']
            : []),
        ]
  await run`pnpm exec tauri ${args} ${process.argv.slice(3)}`
}
