import { app } from 'electron'

export const installElectronE2eRuntimeFlags = (): void => {
  if (process.env.MARKLAB_E2E !== '1') return

  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor')
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('use-angle', 'swiftshader')
}
