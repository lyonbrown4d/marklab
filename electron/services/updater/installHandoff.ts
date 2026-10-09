const INSTALL_HANDOFF_TIMEOUT_MS = 30_000

type InstallHandoffOptions = {
  onTimeout: () => void
}

export type InstallHandoff = {
  begin: (onFailure: () => void) => void
  dispose: () => void
  fail: () => void
}

export const createInstallHandoff = ({ onTimeout }: InstallHandoffOptions): InstallHandoff => {
  let failureCallback: (() => void) | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null

  const clear = (): void => {
    if (timeout) clearTimeout(timeout)
    timeout = null
  }

  const fail = (): void => {
    clear()
    const callback = failureCallback
    failureCallback = null
    callback?.()
  }

  const begin = (onFailure: () => void): void => {
    failureCallback = onFailure
    timeout = setTimeout(() => {
      timeout = null
      onTimeout()
      fail()
    }, INSTALL_HANDOFF_TIMEOUT_MS)
    if (typeof timeout === 'object' && 'unref' in timeout) timeout.unref()
  }

  return {
    begin,
    dispose: () => {
      clear()
      failureCallback = null
    },
    fail,
  }
}
