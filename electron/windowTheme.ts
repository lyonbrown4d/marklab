type ThemeAwareWindow = {
  isDestroyed: () => boolean
  setBackgroundColor: (color: string) => void
}

type ThemeAwareWindows = {
  main: ThemeAwareWindow
  splash: ThemeAwareWindow
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
