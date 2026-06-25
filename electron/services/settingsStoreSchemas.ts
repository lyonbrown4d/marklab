import { z } from 'zod'

import type { PersistedWindowState } from '@electron/types.js'

export type PersistedRendererValue = {
  state?: Record<string, unknown>
  version?: number
}

export type PersistedSessionFile = {
  sessions: Record<string, PersistedRendererValue>
}

const recordSchema = z.record(z.string(), z.unknown())

const recordOrEmptySchema = z.preprocess((value) => {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}, recordSchema)

const persistedRendererValueSchema = z.object({
  state: recordOrEmptySchema.optional().default({}),
  version: z.preprocess((value) => {
    return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
  }, z.number().optional()),
})

const roundedNumberOrNullSchema = z
  .unknown()
  .transform((value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null,
  )

const persistedWindowStateSchema = z
  .object({
    height: roundedNumberOrNullSchema,
    isMaximized: z.boolean().catch(false),
    width: roundedNumberOrNullSchema,
    x: roundedNumberOrNullSchema.optional(),
    y: roundedNumberOrNullSchema.optional(),
  })
  .transform((value, ctx): PersistedWindowState => {
    if (value.width === null || value.height === null) {
      ctx.addIssue({ code: 'custom', message: 'Window state requires finite width and height.' })
      return z.NEVER
    }

    return {
      height: value.height,
      isMaximized: value.isMaximized,
      width: value.width,
      ...(value.x !== null && value.x !== undefined ? { x: value.x } : {}),
      ...(value.y !== null && value.y !== undefined ? { y: value.y } : {}),
    }
  })

const persistedSessionFileSchema = z.object({
  sessions: recordOrEmptySchema.optional().default({}),
})

export const normalizePersistedRendererValue = (value: unknown): PersistedRendererValue | null => {
  const result = persistedRendererValueSchema.safeParse(value)
  return result.success ? result.data : null
}

export const normalizeWindowState = (value: unknown): PersistedWindowState | null => {
  const result = persistedWindowStateSchema.safeParse(value)
  return result.success ? result.data : null
}

export const normalizeSessionFile = (value: unknown): PersistedSessionFile | null => {
  const result = persistedSessionFileSchema.safeParse(value)
  if (!result.success) return { sessions: {} }

  const sessions: Record<string, PersistedRendererValue> = {}
  for (const [sessionKey, sessionValue] of Object.entries(result.data.sessions)) {
    const normalized = normalizePersistedRendererValue(sessionValue)
    if (normalized) sessions[sessionKey] = normalized
  }
  return { sessions }
}
