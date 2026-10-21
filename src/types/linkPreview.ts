import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'

const safeHttpUrl = z
  .url()
  .refine((value) => {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  }, 'Expected a safe HTTP URL')
  .transform((value) => new URL(value).toString())

export const linkPreviewRequestSchema = z.object({
  url: safeHttpUrl,
}) satisfies z.ZodType<LinkPreviewRequest>

export const linkPreviewCaptureRequestSchema = linkPreviewRequestSchema.extend({
  priority: z.enum(['background', 'interactive']).default('interactive'),
  requestId: z.uuid(),
}) satisfies z.ZodType<DesktopCommandArgs['link_preview_capture']['request']>

export const linkPreviewCaptureControlSchema = z.object({
  requestId: z.uuid(),
}) satisfies z.ZodType<DesktopCommandArgs['link_preview_cancel']['request']>

const remoteImageCapability = z.string().regex(/^marklab-asset:\/\/remote\/v1\/[A-Za-z0-9_-]{43}$/)

export const linkPreviewCaptureSchema = z.object({
  height: z.number().int().positive().max(2160),
  src: remoteImageCapability,
  url: safeHttpUrl,
  width: z.number().int().positive().max(3840),
}) satisfies z.ZodType<LinkPreviewCapture>

export const linkPreviewWebpageSchema = z.object({
  canonical: safeHttpUrl.nullable(),
  description: z.string().nullable(),
  favicon: safeHttpUrl.nullable(),
  image: safeHttpUrl.nullable(),
  kind: z.literal('webpage'),
  site_name: z.string().nullable(),
  title: z.string().nullable(),
  url: safeHttpUrl,
}) satisfies z.ZodType<LinkPreviewWebpage>

export const linkPreviewImageSchema = z.object({
  kind: z.literal('image'),
  media_type: z.enum(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']),
  src: remoteImageCapability,
  url: safeHttpUrl,
}) satisfies z.ZodType<Extract<LinkPreviewResult, { kind: 'image' }>>

export const linkPreviewResultSchema = z.discriminatedUnion('kind', [
  linkPreviewWebpageSchema,
  linkPreviewImageSchema,
]) satisfies z.ZodType<LinkPreviewResult>

export type LinkPreviewRequest = DesktopCommandArgs['link_preview_fetch']['request']

export type PreviewCapturePriority = NonNullable<
  DesktopCommandArgs['link_preview_capture']['request']['priority']
>

export type LinkPreviewCaptureOptions = Pick<
  DesktopCommandArgs['link_preview_capture']['request'],
  'priority' | 'requestId'
>

export type LinkPreviewCapture = DesktopCommandResults['link_preview_capture']

export type LinkPreviewResult = DesktopCommandResults['link_preview_fetch']

export type LinkPreviewWebpage = Extract<LinkPreviewResult, { kind: 'webpage' }>
