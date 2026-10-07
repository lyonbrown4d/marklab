import { createFileLabel } from '@/logic/paths'
import type { FsSearchResult } from '@/services/fsApi'
import type {
  CommandNavigationBacklink,
  CommandNavigationMissingLink,
} from '@/components/command/CommandNavigationSection'

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
