import os from 'node:os'
import path from 'node:path'

export const nativeEnvironment = (): NodeJS.ProcessEnv => {
  const environment = { ...process.env }
  // Raw Cargo lacks the Tauri CLI's shared cache default. Keep both aligned.
  if (process.platform !== 'win32' && !environment.CEF_PATH)
    environment.CEF_PATH = path.join(
      os.homedir(),
      process.platform === 'darwin' ? 'Library/Caches/tauri-cef' : '.cache/tauri-cef',
    )
  return environment
}
