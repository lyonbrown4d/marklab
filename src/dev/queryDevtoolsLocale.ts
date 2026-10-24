export const isQueryDevtoolsLocaleSupported = (locale: string): boolean => {
  try {
    // WebKitGTK can expose POSIX locale names that Devtools passes to Intl.Locale.
    new Intl.Locale(locale)
    return true
  } catch {
    return false
  }
}
