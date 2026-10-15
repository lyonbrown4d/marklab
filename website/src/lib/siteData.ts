import snapshot from '@site/data/releases.json'
import { parseReleases } from '#site/lib/releases'

export const releases = parseReleases(snapshot)
