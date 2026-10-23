import type { WorkspacePublicationPlan } from '@/types/workspacePublication'

// This fixture supplies the native analysis DTO from the actual temporary Markdown files.
// It deliberately does not emulate indexing, link analysis, or publication generation.
export const readFixturePublication = async (
  paths: string[],
  read: (path: string) => Promise<{ content: string }>,
): Promise<WorkspacePublicationPlan> => {
  const chapters = await Promise.all(
    paths.map(async (path) => {
      const { content } = await read(path)
      const title = /^#\s+(.+)$/m.exec(content)?.[1] ?? path
      const excerpt = content.replace(/^#\s+.+\n*/, '').trim()
      return {
        path,
        title,
        excerpt,
        depth: 0,
        orphaned: false,
        wordCount: excerpt.split(/\s+/).filter(Boolean).length,
        estimatedPages: 1,
      }
    }),
  )
  return {
    title: 'Publication layout fixture',
    chapters,
    orphanCount: 0,
    totalWords: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
    estimatedPages: chapters.length + 2,
  }
}
