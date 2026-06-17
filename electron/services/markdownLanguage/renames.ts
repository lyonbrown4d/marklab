import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import { headingAnchorSlug } from '@electron/services/workspace/markdown/slugs.js'
import type { FsMarkdownLink, FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import type {
  MarkdownLanguageRenameResult,
  MarkdownLanguageTextEdit,
  RenameRequest,
} from '@electron/services/markdownLanguage/types.js'
import { createMarkdownRequestContext } from '@electron/services/markdownLanguage/requestContext.js'

export const renameMarkdownReferences = async (
  workspace: WorkspaceService,
  request: RenameRequest,
  workspaceIndex: () => Promise<FsWorkspaceIndex>,
): Promise<MarkdownLanguageRenameResult> => {
  if (!request.path || !request.newName.trim()) {
    return emptyRenameResult('No rename target')
  }

  const context = createMarkdownRequestContext(request, await workspaceIndex())
  const currentFile = context.currentFile
  if (!currentFile) return emptyRenameResult('No rename target')

  const heading = currentFile.headings.find((item) => item.line === request.line)
  if (!heading) return emptyRenameResult('Rename is only supported on Markdown headings')

  const newText = request.newName.trim()
  const newSlug = headingAnchorSlug(newText)
  if (!newSlug) return emptyRenameResult('Heading text cannot be empty')

  const edits = [
    headingTextEdit(request.path, request.content, request.line, heading.text, newText),
    ...(await headingReferenceEdits({
      workspace,
      activePath: request.path,
      activeContent: request.content,
      targetPath: request.path,
      oldSlug: heading.slug,
      newSlug,
      workspaceIndex: context.index,
    })),
  ].filter((edit): edit is MarkdownLanguageTextEdit => Boolean(edit))

  const applied = await applyExternalEdits(workspace, request.path, edits)
  return {
    edits: edits.filter((edit) => edit.path === request.path),
    appliedEdits: applied.appliedEdits,
    touchedFiles: applied.touchedFiles,
    rejectReason: null,
  }
}

const emptyRenameResult = (rejectReason: string): MarkdownLanguageRenameResult => ({
  edits: [],
  appliedEdits: 0,
  touchedFiles: [],
  rejectReason,
})

const headingTextEdit = (
  path: string,
  content: string,
  line: number,
  oldText: string,
  newText: string,
): MarkdownLanguageTextEdit | null => {
  const lineText = content.split(/\r?\n/)[line - 1] ?? ''
  const marker = lineText.match(/^\s{0,3}#{1,6}\s+/)?.[0]
  const fallbackStart = marker ? marker.length : Math.max(0, lineText.indexOf(oldText))
  const textStart = lineText.indexOf(oldText, fallbackStart)
  if (textStart < 0) return null

  return {
    path,
    line,
    startColumn: textStart + 1,
    endColumn: textStart + oldText.length + 1,
    newText,
  }
}

const headingReferenceEdits = async ({
  workspace,
  activePath,
  activeContent,
  targetPath,
  oldSlug,
  newSlug,
  workspaceIndex,
}: {
  workspace: WorkspaceService
  activePath: string
  activeContent: string
  targetPath: string
  oldSlug: string
  newSlug: string
  workspaceIndex: FsWorkspaceIndex
}) => {
  const edits: MarkdownLanguageTextEdit[] = []
  for (const file of workspaceIndex.files) {
    const links = file.links.filter(
      (link) =>
        !link.is_external &&
        link.target_path === targetPath &&
        link.target_heading_slug === oldSlug,
    )
    if (links.length === 0) continue

    const content =
      file.path === activePath ? activeContent : await workspace.readFile({ path: file.path })
    for (const link of links) {
      const edit = linkTargetEdit(
        file.path,
        content,
        link,
        replaceTargetAnchor(link.target, newSlug),
      )
      if (edit) edits.push(edit)
    }
  }
  return edits
}

const replaceTargetAnchor = (target: string, newSlug: string) => {
  const hashIndex = target.indexOf('#')
  if (hashIndex < 0) return `${target}#${newSlug}`
  return `${target.slice(0, hashIndex + 1)}${newSlug}`
}

const linkTargetEdit = (
  path: string,
  content: string,
  link: FsMarkdownLink,
  newText: string,
): MarkdownLanguageTextEdit | null => {
  const lineText = content.split(/\r?\n/)[link.line - 1] ?? ''
  const searchStart = Math.max(0, link.column - 1)
  const targetStart = lineText.indexOf(link.target, searchStart)
  const fallbackStart = targetStart >= 0 ? targetStart : lineText.indexOf(link.target)
  if (fallbackStart < 0) return null

  return {
    path,
    line: link.line,
    startColumn: fallbackStart + 1,
    endColumn: fallbackStart + link.target.length + 1,
    newText,
  }
}

const applyExternalEdits = async (
  workspace: WorkspaceService,
  activePath: string,
  edits: MarkdownLanguageTextEdit[],
) => {
  let appliedEdits = 0
  const touchedFiles: string[] = []
  const editsByPath = new Map<string, MarkdownLanguageTextEdit[]>()
  for (const edit of edits) {
    if (edit.path === activePath) continue
    const pathEdits = editsByPath.get(edit.path) ?? []
    pathEdits.push(edit)
    editsByPath.set(edit.path, pathEdits)
  }

  for (const [path, pathEdits] of editsByPath) {
    const content = await workspace.readFile({ path })
    const nextContent = applyTextEdits(content, pathEdits)
    if (nextContent === content) continue
    workspace.updateBuffer({ path, content: nextContent })
    appliedEdits += pathEdits.length
    touchedFiles.push(path)
  }

  return { appliedEdits, touchedFiles }
}

const applyTextEdits = (content: string, edits: MarkdownLanguageTextEdit[]) => {
  const lines = content.split(/\r?\n/)
  const ordered = [...edits].sort((a, b) => b.line - a.line || b.startColumn - a.startColumn)
  for (const edit of ordered) {
    const lineIndex = edit.line - 1
    const lineText = lines[lineIndex]
    if (lineText == null) continue
    lines[lineIndex] =
      lineText.slice(0, edit.startColumn - 1) + edit.newText + lineText.slice(edit.endColumn - 1)
  }
  return lines.join('\n')
}
