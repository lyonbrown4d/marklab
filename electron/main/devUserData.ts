import path from 'node:path'

import type { App } from 'electron'

type DevUserDataTarget = Pick<App, 'isPackaged' | 'setPath'>

export const configureDevUserDataPath = (
  app: DevUserDataTarget,
  environment: NodeJS.ProcessEnv = process.env,
): string | null => {
  const configured = environment.MARKLAB_DEV_USER_DATA_DIR
  if (app.isPackaged || configured === undefined) return null
  if (!configured.trim()) {
    throw new Error('MARKLAB_DEV_USER_DATA_DIR must be a non-empty filesystem path.')
  }
  const resolved = path.resolve(configured)
  app.setPath('userData', resolved)
  return resolved
}
