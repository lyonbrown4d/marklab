import { app } from 'electron'

import { noopLogger, type Logger } from '@electron/services/logger.js'
import type {
  AppLaunchInfo,
  AppLaunchSource,
  DeepLinkPayload,
  SingleInstancePayload,
} from '@electron/types.js'

const DEEP_LINK_SCHEME = 'marklab'
const SUPPORTED_DEEP_LINK_SCHEMES = new Set([DEEP_LINK_SCHEME])
const MAX_DEEP_LINK_URL_LENGTH = 4096
const MAX_STORED_DEEP_LINKS = 20

type DeepLinkPublisher = (payload: DeepLinkPayload) => void

export const getLaunchInfo = (): AppLaunchInfo => ({
  args: [...launchInfo.args],
  cwd: launchInfo.cwd,
  deepLinks: launchInfo.deepLinks.map((entry) => ({ ...entry })),
})

export const createSingleInstancePayload = (
  args: readonly unknown[],
  cwd: unknown,
): SingleInstancePayload => ({
  args: userArgsFromCommandLine(args),
  cwd: typeof cwd === 'string' ? cwd : '',
})

export const publishDeepLinksFromArgs = (
  values: readonly unknown[],
  source: AppLaunchSource,
  publish: DeepLinkPublisher,
): void => {
  for (const payload of collectDeepLinkPayloads(values, source)) {
    publishDeepLink(payload, publish)
  }
}

export const publishDeepLinkUrl = (
  url: unknown,
  source: AppLaunchSource,
  publish: DeepLinkPublisher,
): void => {
  const parsed = parseDeepLinkUrl(url)
  if (!parsed) return
  publishDeepLink(createDeepLinkPayload(parsed, source), publish)
}

export const registerDeepLinkProtocol = (logger: Logger = noopLogger): void => {
  try {
    const processWithLaunchPath = process as typeof process & {
      argv?: readonly unknown[]
      execPath?: string
    }
    const entryPath = normalizeArgs(processWithLaunchPath.argv ?? [])[1]
    for (const scheme of SUPPORTED_DEEP_LINK_SCHEMES) {
      if (!app.isPackaged && processWithLaunchPath.execPath && entryPath) {
        app.setAsDefaultProtocolClient(scheme, processWithLaunchPath.execPath, [entryPath])
      } else {
        app.setAsDefaultProtocolClient(scheme)
      }
    }
  } catch (error) {
    logger.warn('unable to register deep link protocol', { error, scheme: DEEP_LINK_SCHEME })
  }
}

const getProcessArgs = (): string[] => {
  const processWithArgs = process as typeof process & { argv?: readonly unknown[] }
  return userArgsFromCommandLine(processWithArgs.argv ?? [])
}

const getProcessCwd = (): string => {
  try {
    return process.cwd()
  } catch {
    return ''
  }
}

const normalizeArgs = (args: readonly unknown[]): string[] =>
  args.filter((arg): arg is string => typeof arg === 'string')

const userArgsFromCommandLine = (args: readonly unknown[]): string[] => {
  const normalized = normalizeArgs(args)
  return normalized.slice(app.isPackaged ? 1 : 2)
}

export const launchInfo: AppLaunchInfo = {
  args: getProcessArgs(),
  cwd: getProcessCwd(),
  deepLinks: [],
}

const parseDeepLinkUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const rawUrl = value.trim()
  if (!rawUrl || rawUrl.length > MAX_DEEP_LINK_URL_LENGTH) return null

  try {
    const parsed = new URL(rawUrl)
    const scheme = parsed.protocol.slice(0, -1).toLowerCase()
    if (!SUPPORTED_DEEP_LINK_SCHEMES.has(scheme)) return null
    if (parsed.username || parsed.password) return null
    return parsed.toString()
  } catch {
    return null
  }
}

const createDeepLinkPayload = (url: string, source: AppLaunchSource): DeepLinkPayload => ({
  url,
  source,
  receivedAt: Date.now(),
})

const collectDeepLinkPayloads = (
  values: readonly unknown[],
  source: AppLaunchSource,
): DeepLinkPayload[] =>
  values
    .map(parseDeepLinkUrl)
    .filter((url): url is string => url !== null)
    .map((url) => createDeepLinkPayload(url, source))

const storeDeepLink = (payload: DeepLinkPayload): void => {
  launchInfo.deepLinks.push(payload)
  if (launchInfo.deepLinks.length > MAX_STORED_DEEP_LINKS) {
    launchInfo.deepLinks.splice(0, launchInfo.deepLinks.length - MAX_STORED_DEEP_LINKS)
  }
}

const publishDeepLink = (payload: DeepLinkPayload, publish: DeepLinkPublisher): void => {
  storeDeepLink(payload)
  publish(payload)
}
