export const shouldEnableReactScan = (development: boolean, flag?: string): boolean =>
  development && flag !== 'false'

export const initializeReactScan = (development: boolean, flag?: string): void => {
  if (!import.meta.env.DEV) return
  if (!shouldEnableReactScan(development, flag)) return

  void import('react-scan')
    .then(({ scan }) => {
      void scan({ enabled: true })
    })
    .catch((error) => {
      console.warn('React Scan failed to initialize', error)
    })
}
