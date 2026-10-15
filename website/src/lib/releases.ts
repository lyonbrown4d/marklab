import { z } from 'zod'

export const repository = 'https://github.com/lyonbrown4d/marklab'
export const releasesUrl = `${repository}/releases`

const ownedUrl = (prefix: string) =>
  z.url().refine((value) => {
    const url = new URL(value)
    return url.origin === 'https://github.com' && url.pathname.startsWith(prefix)
  }, 'Expected a Marklab GitHub URL')

const assetSchema = z.object({
  name: z.string(),
  browser_download_url: ownedUrl('/lyonbrown4d/marklab/releases/download/'),
  size: z.number().int().positive(),
  state: z.literal('uploaded'),
})

export const releaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.iso.datetime().nullable(),
  html_url: ownedUrl('/lyonbrown4d/marklab/releases/tag/'),
  assets: z.array(assetSchema),
})

export type Release = z.infer<typeof releaseSchema>

export const parseReleases = (value: unknown): Release[] =>
  z
    .array(releaseSchema)
    .parse(value)
    .filter(
      (release) =>
        !release.draft &&
        !release.prerelease &&
        release.published_at &&
        /^app-v\d+\.\d+\.\d+$/.test(release.tag_name),
    )
    .sort((left, right) => {
      const a = left.tag_name.slice(5).split('.').map(Number)
      const b = right.tag_name.slice(5).split('.').map(Number)
      for (let index = 0; index < 3; index++) {
        const difference = b[index]! - a[index]!
        if (difference) return difference
      }
      return 0
    })
