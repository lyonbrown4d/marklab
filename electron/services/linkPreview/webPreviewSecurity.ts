import type { Session } from 'electron'

import {
  assertPublicLinkPreviewUrl,
  type LinkPreviewLookup,
} from '@electron/services/linkPreview/networkSecurity.js'

type CaptureSession = Pick<
  Session,
  | 'on'
  | 'setDevicePermissionHandler'
  | 'setDisplayMediaRequestHandler'
  | 'setPermissionCheckHandler'
  | 'setPermissionRequestHandler'
  | 'webRequest'
>

const SAFE_LOCAL_PROTOCOLS = new Set(['about:', 'blob:', 'data:'])
const DEFAULT_VALIDATION_TIMEOUT_MS = 5_000

export const installWebPreviewSessionSecurity = (
  session: CaptureSession,
  lookup: LinkPreviewLookup,
  options: { timeoutMs?: number } = {},
): void => {
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.setDevicePermissionHandler(() => false)
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}))
  session.on('will-download', (event) => event.preventDefault())
  session.webRequest.onBeforeRequest((details, callback) => {
    void isAllowedRequest(
      details.url,
      lookup,
      options.timeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS,
    ).then(
      (allowed) => callback({ cancel: !allowed }),
      () => callback({ cancel: true }),
    )
  })
}

const isAllowedRequest = async (
  value: string,
  lookup: LinkPreviewLookup,
  timeoutMs: number,
): Promise<boolean> => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (SAFE_LOCAL_PROTOCOLS.has(url.protocol)) return true
  if (url.protocol !== 'https:') return false
  await withTimeout(assertPublicLinkPreviewUrl(url, lookup), timeoutMs)
  return true
}

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Web preview validation timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
