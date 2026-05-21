import { slug as githubSlug } from 'github-slugger'

export const uniqueGithubSlug = (text: string, used: Map<string, number>): string => {
  const base = githubSlug(text) || 'heading'
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

export const headingAnchorSlug = (text: string): string => {
  return githubSlug(text) || 'heading'
}
