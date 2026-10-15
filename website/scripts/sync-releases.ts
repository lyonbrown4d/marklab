import { writeFile } from 'node:fs/promises'
import { parseReleases } from '#site/lib/releases'
// eslint-disable-next-line no-restricted-imports -- Build-time environment stays beside this standalone script.
import { releaseEnvironment } from './env.ts'

const headers: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Marklab-website-build',
}
if (releaseEnvironment.githubToken)
  headers.Authorization = `Bearer ${releaseEnvironment.githubToken}`

const response = await fetch(
  'https://api.github.com/repos/lyonbrown4d/marklab/releases?per_page=100',
  {
    headers,
    signal: AbortSignal.timeout(30_000),
  },
)
if (!response.ok) throw new Error(`Release refresh failed: GitHub HTTP ${response.status}`)
const releases = parseReleases(await response.json())
if (!releases.length) throw new Error('GitHub returned no published stable Marklab releases')
await writeFile(
  new URL('../src/data/releases.json', import.meta.url),
  JSON.stringify(releases, null, 2) + '\n',
)
console.log(`Synced ${releases.length} published releases; newest is ${releases[0]!.tag_name}.`)
