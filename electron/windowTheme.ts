type ThemeAwareWindow = {
  isDestroyed: () => boolean
  setBackgroundColor: (color: string) => void
}

type ThemeAwareWindows = {
  main: ThemeAwareWindow
  splash: ThemeAwareWindow
}

type IconAwareWindow = {
  isDestroyed: () => boolean
  setIcon: (icon: Electron.NativeImage) => void
}

type IconAwareWindows = {
  main: IconAwareWindow
  splash: IconAwareWindow
}

export const resolveNativeWindowBackground = (dark: boolean): string =>
  dark ? '#171717' : '#faf9f7'

export const syncNativeWindowBackgrounds = (
  windows: ThemeAwareWindows | null,
  dark: boolean,
): void => {
  if (!windows) return
  const color = resolveNativeWindowBackground(dark)
  for (const window of [windows.main, windows.splash]) {
    if (!window.isDestroyed()) window.setBackgroundColor(color)
  }
}

export const syncNativeWindowIcons = (
  windows: IconAwareWindows | null,
  icon: Electron.NativeImage | undefined,
  platform: NodeJS.Platform | string = process.platform,
): void => {
  if (!windows || !icon || platform === 'darwin') return
  for (const window of [windows.main, windows.splash]) {
    if (!window.isDestroyed()) window.setIcon(icon)
  }
}
