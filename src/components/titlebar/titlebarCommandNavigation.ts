import { createFileLabel } from '@/logic/paths'
import type { FsSearchResult, FsWorkspaceIndex } from '@/services/fsApi'
import type {
  CommandNavigationBacklink,
  CommandNavigationHeading,
  CommandNavigationMissingLink,
} from '@/components/command/CommandNavigationSection'

export type TitlebarCommandNavigationModel = {
  headings: CommandNavigationHeading[]
  backlinks: CommandNavigationBacklink[]
  missingLinks: CommandNavigationMissingLink[]
}

export const buildTitlebarCommandNavigationModel = (
  activePath: string | null,
  workspaceIndex?: FsWorkspaceIndex | null,
): TitlebarCommandNavigationModel => {
  if (!activePath || !workspaceIndex) return emptyNavigationModel

  const activeFile = workspaceIndex.files.find((file) => file.path === activePath) ?? null
  if (!activeFile) return emptyNavigationModel

  return {
    headings: activeFile.headings.map((heading) => ({
      path: activeFile.path,
      slug: heading.slug,
      text: heading.text,
      level: heading.level,
    })),
    backlinks: workspaceIndex.files.flatMap((file) =>
      file.links
        .filter((link) => !link.is_external && link.target_path === activePath)
        .map((link) => ({
          sourcePath: file.path,
          text: link.text || link.target,
          context: link.context,
          line: link.line,
          column: link.column,
          targetAnchor: link.target_anchor ?? null,
        })),
    ),
    missingLinks: activeFile.links
      .filter((link) => !link.is_external && !link.target_path)
      .map((link) => ({
        path: activeFile.path,
        target: link.target,
        text: link.text || link.target,
        context: link.context,
        line: link.line,
        column: link.column,
        linkType: link.link_type,
      })),
  }
}

export const navigationBacklinkToSearchResult = (
  backlink: CommandNavigationBacklink,
): FsSearchResult => ({
  path: backlink.sourcePath,
  title: createFileLabel(backlink.sourcePath),
  line: backlink.line,
  column: backlink.column,
  end_column: backlink.column + Math.max(1, backlink.text.length),
  snippet: backlink.context || backlink.text,
  snippet_highlights: [],
  score: 0,
})

export const navigationMissingLinkToSearchResult = (
  missingLink: CommandNavigationMissingLink,
): FsSearchResult => ({
  path: missingLink.path,
  title: createFileLabel(missingLink.path),
  line: missingLink.line,
  column: missingLink.column,
  end_column: missingLink.column + Math.max(1, missingLink.target.length),
  snippet: missingLink.context || missingLink.text,
  snippet_highlights: [],
  score: 0,
})

const emptyNavigationModel: TitlebarCommandNavigationModel = {
  headings: [],
  backlinks: [],
  missingLinks: [],
}
