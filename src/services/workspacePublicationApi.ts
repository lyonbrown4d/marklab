import { z } from 'zod'
import { saveDialog } from '@/runtime/dialog'
import { invoke } from '@/runtime/ipc'
import type {
  WorkspacePublicationOptions,
  WorkspacePublicationPlan,
} from '@/types/workspacePublication'

const chapterSchema = z
  .object({
    depth: z.number().int().min(0).max(2),
    estimatedPages: z.number().int().positive(),
    excerpt: z.string(),
    orphaned: z.boolean(),
    path: z.string().min(1),
    title: z.string().min(1),
    wordCount: z.number().int().nonnegative(),
  })
  .strict()

const planSchema = z
  .object({
    chapters: z.array(chapterSchema),
    estimatedPages: z.number().int().nonnegative(),
    orphanCount: z.number().int().nonnegative(),
    title: z.string().min(1),
    totalWords: z.number().int().nonnegative(),
  })
  .strict()

const loadPlan = async (): Promise<WorkspacePublicationPlan> =>
  planSchema.parse(await invoke('fs_get_workspace_publication_plan'))

const exportPublication = async (
  chapters: Array<{ path: string; title: string }>,
  options: WorkspacePublicationOptions,
  rootPath: string,
): Promise<string | undefined> => {
  const extension = options.format === 'markdown' ? 'md' : options.format
  const outputPath = await saveDialog({
    defaultPath: defaultOutputPath(rootPath, options.title, extension),
    filters: [
      {
        extensions: [extension],
        name: options.format === 'docx' ? 'Word' : options.format.toUpperCase(),
      },
    ],
  })
  if (!outputPath) return undefined
  return invoke('export_workspace_publication', { chapters, options, outputPath })
}

const defaultOutputPath = (rootPath: string, title: string, extension: string): string => {
  const separator = rootPath.includes('\\') ? '\\' : '/'
  const normalizedRoot = rootPath.replace(/[/\\]+$/, '')
  const outputRoot = /\.(?:md|markdown)$/i.test(normalizedRoot)
    ? normalizedRoot.slice(
        0,
        Math.max(normalizedRoot.lastIndexOf('/'), normalizedRoot.lastIndexOf('\\')),
      )
    : normalizedRoot
  const withoutControlCharacters = Array.from(title, (character) =>
    character.charCodeAt(0) < 32 ? '-' : character,
  ).join('')
  const safeTitle = withoutControlCharacters.replace(/[<>:"/\\|?*]/g, '-').trim() || 'workspace'
  return `${outputRoot}${separator}${safeTitle}.${extension}`
}

export const workspacePublicationApi = { exportPublication, loadPlan }
