import { GitOperationError } from '@electron/services/git/errors'
import { runGit } from '@electron/services/git/helpers'

export type ConflictMarkerConfig = { markerSize: number; attribute: string }

export const readConflictMarkerConfig = async (
  root: string,
  file: string,
): Promise<ConflictMarkerConfig> => {
  const { stdout } = await runGit(root, [
    '--literal-pathspecs',
    'check-attr',
    '-z',
    'conflict-marker-size',
    '--',
    file,
  ])
  const attribute = stdout.split('\0')[2]
  if (attribute === undefined)
    throw new GitOperationError(
      'git_command_failed',
      'Git returned invalid conflict marker attributes',
    )
  if (['unspecified', 'set', 'unset'].includes(attribute)) return { markerSize: 7, attribute }
  const markerSize = Number(attribute)
  if (
    !/^\d+$/.test(attribute) ||
    !Number.isSafeInteger(markerSize) ||
    markerSize < 1 ||
    markerSize > 1024
  ) {
    throw new GitOperationError(
      'git_invalid_input',
      'Conflict marker width must be an integer between 1 and 1024',
    )
  }
  return { markerSize, attribute }
}

export const hasConflictMarkers = (content: string, markerSize: number): boolean => {
  const minimum = Math.min(7, markerSize)
  if (
    new RegExp(
      `^(?:<{${minimum},}|={${minimum},}|>{${minimum},}|\\|{${minimum},})(?:[ \\t].*|\\r?$)`,
      'm',
    ).test(content)
  )
    return true
  // Attribute changes do not rewrite existing worktree markers. Detect complete
  // blocks of earlier widths without treating every short Markdown line as a marker.
  const opened = new Set<number>()
  const separated = new Set<number>()
  for (const line of content.split('\n')) {
    const match = /^(<{1,1024}|={1,1024}|>{1,1024})(?:[ \t].*|\r?)$/.exec(line)
    if (!match) continue
    const width = match[1]!.length
    if (line[0] === '<') opened.add(width)
    if (line[0] === '=' && opened.has(width)) separated.add(width)
    if (line[0] === '>' && separated.has(width)) return true
  }
  return false
}
