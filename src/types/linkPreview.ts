import { z } from 'zod'

const safeHttpUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  }, 'Expected a safe HTTP URL')
  .transform((value) => new URL(value).toString())

export const linkPreviewRequestSchema = z.object({ url: safeHttpUrl })

const remoteImageCapability = z.string().regex(/^marklab-asset:\/\/remote\/v1\/[A-Za-z0-9_-]{43}$/)

export const linkPreviewCaptureSchema = z.object({
  height: z.number().int().positive().max(2160),
  src: remoteImageCapability,
  url: safeHttpUrl,
  width: z.number().int().positive().max(3840),
})

export const linkPreviewWebpageSchema = z.object({
  canonical: safeHttpUrl.nullable(),
  description: z.string().nullable(),
  favicon: safeHttpUrl.nullable(),
  image: safeHttpUrl.nullable(),
  kind: z.literal('webpage'),
  site_name: z.string().nullable(),
  title: z.string().nullable(),
  url: safeHttpUrl,
})

export const linkPreviewImageSchema = z.object({
  kind: z.literal('image'),
  media_type: z.enum(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']),
  src: remoteImageCapability,
  url: safeHttpUrl,
})

export const linkPreviewResultSchema = z.discriminatedUnion('kind', [
  linkPreviewWebpageSchema,
  linkPreviewImageSchema,
])

export type LinkPreviewRequest = z.infer<typeof linkPreviewRequestSchema>
export type LinkPreviewCapture = z.infer<typeof linkPreviewCaptureSchema>
export type LinkPreviewResult = z.infer<typeof linkPreviewResultSchema>
export type LinkPreviewWebpage = z.infer<typeof linkPreviewWebpageSchema>
