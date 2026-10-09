import type { UpdateService } from '@electron/services/updater/service'

type QuitApp = {
  quit: () => void
}

type QuitUpdateService = Pick<UpdateService, 'dispose' | 'quitAndInstallIfScheduled'>

export const continueAppQuit = (app: QuitApp, updates: QuitUpdateService | null): void => {
  let fallbackStarted = false
  const continueNormally = (): void => {
    if (fallbackStarted) return
    fallbackStarted = true
    updates?.dispose()
    app.quit()
  }
  const installerOwnsQuit = updates?.quitAndInstallIfScheduled(continueNormally) ?? false
  if (!installerOwnsQuit) continueNormally()
}
