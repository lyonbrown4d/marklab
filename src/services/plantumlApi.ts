import { z } from 'zod'
import { invoke } from '@/runtime/ipc'

const resultSchema = z.object({
  engineVersion: z.literal('puml-0.2.6'),
  pages: z
    .array(
      z.object({
        url: z.string().regex(/^marklab-asset:\/\/local\/v1\/[A-Za-z0-9_-]{43}$/),
        expires_at_ms: z.number().nonnegative(),
      }),
    )
    .min(1)
    .max(16),
  warnings: z.array(z.string()).max(20),
})

export type PlantUmlPreviewResult = z.infer<typeof resultSchema>

export const plantumlApi = {
  async render(source: string, signal: AbortSignal): Promise<PlantUmlPreviewResult> {
    signal.throwIfAborted()
    const requestId = crypto.randomUUID()
    const cancel = () => {
      void invoke('plantuml_cancel', { requestId }).catch(() => undefined)
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = await invoke<unknown>('plantuml_render', { requestId, source })
      signal.throwIfAborted()
      return resultSchema.parse(result)
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  },
}
