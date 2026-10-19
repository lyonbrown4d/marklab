import { z } from 'zod'
import { invoke } from '@/runtime/ipc'

const cellSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  formula: z.string().optional(),
  format: z.string().optional(),
})

const pageSchema = z.object({
  sheets: z.array(z.string()),
  sheet: z.string(),
  columns: z.number().int().nonnegative().max(256),
  totalRows: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  rows: z.array(z.array(z.string()).max(256)).max(500),
  truncated: z.boolean(),
  cells: z.array(z.array(cellSchema).max(256)).max(500).optional(),
  calculation: z
    .object({
      status: z.enum(['cached', 'recalculated']),
      warnings: z.array(z.string()),
      errorCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
})

export type SpreadsheetCell = z.infer<typeof cellSchema>
export type SpreadsheetPage = z.infer<typeof pageSchema>
export type SpreadsheetPageRequest = {
  path: string
  source?: string
  assetUrl?: string
  sheet?: string
  offset?: number
  limit?: number
  recalculate?: boolean
}

// WebView2 uses a transport URL for the same opaque local asset capability.
const canonicalAssetUrl = (value: string) => {
  const withoutHash = value.split('#')[0] ?? value
  return withoutHash.replace(
    /^http:\/\/marklab-asset\.localhost\/local\/v1\//,
    'marklab-asset://local/v1/',
  )
}

export const spreadsheetApi = {
  readPage: async (
    request: SpreadsheetPageRequest,
    signal: AbortSignal,
  ): Promise<SpreadsheetPage> => {
    signal.throwIfAborted()
    const result = await invoke<unknown>('spreadsheet_read_page', {
      ...request,
      ...(request.assetUrl ? { assetUrl: canonicalAssetUrl(request.assetUrl) } : {}),
    })
    signal.throwIfAborted()
    return pageSchema.parse(result)
  },
}
