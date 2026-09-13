import { protocol } from 'electron'

import { parseWorkspaceAssetCapabilityUrl } from '@electron/services/workspace/workspaceAssetCapabilities.js'
import type {
  WorkspaceAssetByteRange as AssetByteRange,
  WorkspaceOpenedAsset,
} from '@electron/services/workspace/workspaceOpenedAsset.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'

const ASSET_PROTOCOL = 'marklab-asset'

type ParsedAssetRange = { ok: true; range: AssetByteRange | null } | { ok: false }

let assetProtocolRegistered = false
let assetProtocolPrivilegesRegistered = false

export const registerAssetProtocolPrivileges = (): void => {
  if (assetProtocolPrivilegesRegistered) return
  assetProtocolPrivilegesRegistered = true

  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
      },
    },
  ])
}

export const registerAssetProtocol = (
  getWorkspaceRegistry: () => WindowWorkspaceRegistry | null,
): void => {
  if (assetProtocolRegistered) return
  assetProtocolRegistered = true

  protocol.handle(ASSET_PROTOCOL, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return notFoundResponse()
    }

    const token = parseWorkspaceAssetCapabilityUrl(request.url)
    if (!token) return notFoundResponse()

    let asset: WorkspaceOpenedAsset | null = null
    try {
      asset = (await getWorkspaceRegistry()?.resolveAssetCapability(token)) ?? null
      if (!asset) return notFoundResponse()

      const parsedRange = parseAssetRange(request.headers.get('range'), asset.sizeBytes)
      if (!parsedRange.ok) {
        const sizeBytes = asset.sizeBytes
        await asset.close()
        asset = null
        return rangeNotSatisfiableResponse(sizeBytes)
      }

      if (request.method === 'HEAD') {
        const response = headResponse(asset, parsedRange.range)
        await asset.close()
        asset = null
        return response
      }

      const body = asset.createWebStream(parsedRange.range)
      const response = new Response(body, {
        status: parsedRange.range ? 206 : 200,
        headers: createAssetHeaders(asset, parsedRange.range),
      })
      asset = null
      return response
    } catch {
      await asset?.close().catch(() => undefined)
      return notFoundResponse()
    }
  })
}

const headResponse = (asset: WorkspaceOpenedAsset, range: AssetByteRange | null): Response => {
  return new Response(null, {
    status: range ? 206 : 200,
    headers: createAssetHeaders(asset, range),
  })
}

const createAssetHeaders = (asset: WorkspaceOpenedAsset, range: AssetByteRange | null): Headers => {
  const headers = new Headers()
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'no-store')
  headers.set('content-length', String(range ? range.end - range.start + 1 : asset.sizeBytes))
  headers.set('content-type', asset.mediaType ?? 'application/octet-stream')
  headers.set('x-content-type-options', 'nosniff')
  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${asset.sizeBytes}`)
  }
  return headers
}

const notFoundResponse = (): Response => {
  return new Response(null, {
    status: 404,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

const rangeNotSatisfiableResponse = (sizeBytes: number): Response => {
  return new Response(null, {
    status: 416,
    headers: {
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
      'content-range': `bytes ${'*'}/${sizeBytes}`,
      'x-content-type-options': 'nosniff',
    },
  })
}

const parseAssetRange = (value: string | null, sizeBytes: number): ParsedAssetRange => {
  if (!value) return { ok: true, range: null }
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2]) || sizeBytes <= 0) return { ok: false }

  if (!match[1]) {
    const suffixLength = parseSafeInteger(match[2])
    if (suffixLength == null || suffixLength <= 0) return { ok: false }
    return {
      ok: true,
      range: {
        start: Math.max(sizeBytes - suffixLength, 0),
        end: sizeBytes - 1,
      },
    }
  }

  const start = parseSafeInteger(match[1])
  const requestedEnd = match[2] ? parseSafeInteger(match[2]) : sizeBytes - 1
  if (start == null || requestedEnd == null || start >= sizeBytes || requestedEnd < start) {
    return { ok: false }
  }
  return {
    ok: true,
    range: {
      start,
      end: Math.min(requestedEnd, sizeBytes - 1),
    },
  }
}

const parseSafeInteger = (value: string | undefined): number | null => {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}
